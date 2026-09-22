import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

/** The registry's name. Fixed, so the site can refer to it by name rather than through the other stack. */
export const REPOSITORY_NAME = "rva4neva-olympics";

/**
 * The container registry, in a stack of its own.
 *
 * It has to exist before the app does: App Runner refuses to create a service whose
 * image is not there yet. So the registry is deployed first, the image is pushed, and
 * only then is the rest of the site created. (scripts/deploy.ts does that in order.)
 */
export class RegistryStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: REPOSITORY_NAME,
      // Every deploy pushes its own tag, and a tag that is already there is never
      // silently overwritten, so "what is running" always means one exact image.
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [{ description: "Keep the ten most recent images", maxImageCount: 10 }],
      // Images can always be rebuilt from the code, so tearing the stack down removes them too.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    new cdk.CfnOutput(this, "RepositoryUri", { value: this.repository.repositoryUri });
  }
}

export interface SiteStackProps extends cdk.StackProps {
  /** Tag of the image to run. */
  imageTag: string;
  /** IPv4 address allowed to reach the database directly. Optional. */
  adminIp?: string;
}

/**
 * The site: a network, the database, and the App Runner service in front of it.
 *
 *   visitors ──HTTPS──▶ App Runner ──(VPC connector, private addresses)──▶ Aurora
 *                                                                            ▲
 *                                       your laptop, from one IP address ────┘
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    // The registry is looked up by its fixed name, not wired in from the other stack. A
    // direct reference would work, but CDK now expresses those with a very new
    // CloudFormation feature, and there is no reason to depend on it for a name that
    // never changes. The deploy script creates the registry first regardless.
    const repository = ecr.Repository.fromRepositoryName(this, "Repository", REPOSITORY_NAME);

    // --- network ----------------------------------------------------------------------
    //
    // Two availability zones (Aurora insists on two) and public subnets only, with NO NAT
    // gateway. A NAT gateway is about $32 a month, and it would only serve the app's own
    // outbound internet traffic, of which there is none: the server calls nothing but the
    // database. (The YouTube player loads in the visitor's browser, and fonts are fetched
    // at build time.)
    //
    // The subnets are public because the database is reachable from your laptop, which
    // needs a route to the internet. What actually protects the database is its security
    // group below, not the subnet type.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });

    // --- who may talk to the database ---------------------------------------------------
    const appSecurityGroup = new ec2.SecurityGroup(this, "AppSecurityGroup", {
      vpc,
      description: "App Runner instances, through the VPC connector",
      allowAllOutbound: true,
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc,
      description: "Aurora: the app, and one admin IP address. Nothing else.",
      allowAllOutbound: false,
    });
    databaseSecurityGroup.addIngressRule(appSecurityGroup, ec2.Port.tcp(5432), "The app");
    if (props.adminIp) {
      databaseSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(`${props.adminIp}/32`),
        ec2.Port.tcp(5432),
        "Admin machine: migrations and psql",
      );
    }

    // --- database ------------------------------------------------------------------------
    //
    // Aurora Serverless v2 with a minimum of 0 capacity: after five idle minutes it pauses
    // and costs only its storage, then resumes on the next connection (about 15 seconds,
    // which the app's connection timeout allows for). A paused database is most of this
    // site's life, since it counts down for a year and is busy for two days.
    const database = new rds.DatabaseCluster(this, "Database", {
      clusterIdentifier: "rva4neva-olympics",
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_4 }),
      writer: rds.ClusterInstance.serverlessV2("Writer", { publiclyAccessible: true }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [databaseSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret("olympics", { secretName: "rva4neva/database-master" }),
      defaultDatabaseName: "olympics",
      storageEncrypted: true,
      backup: { retention: cdk.Duration.days(7) },
      // Deleting the stack takes a final snapshot first, so removing the infrastructure
      // never means losing the scores.
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });
    // CDK's validator warns that the instance is publicly accessible. That is the design:
    // it lets you run migrations from your own machine, and it is what the security group
    // above (the app plus one IP address, nothing else) is there to make safe.
    cdk.Validations.of(database).acknowledge({
      id: "CloudFormation-Validate::W9011",
      reason: "Reachable from one admin IP only, enforced by the database security group",
    });

    // --- the app's own database login -----------------------------------------------------
    //
    // The app connects as a less-privileged role than the owner, so it can read and write
    // scores but not reshape the schema. That role, and this secret's real value, are
    // created by `npm run aws:db` after the first deploy. CloudFormation only ever writes
    // the placeholder below; it does not touch the value again on later deploys.
    const appDatabaseUrl = new secretsmanager.Secret(this, "AppDatabaseUrl", {
      secretName: "rva4neva/app-database-url",
      description: "DATABASE_URL for the app's database role. Written by `npm run aws:db`.",
      secretStringValue: cdk.SecretValue.unsafePlainText("not-provisioned-yet"),
    });

    // --- App Runner ------------------------------------------------------------------------
    // The access role lets App Runner pull the image from the registry. The instance role is
    // what the running app is allowed to do: read its one secret, and nothing else.
    const accessRole = new iam.Role(this, "AccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess"),
      ],
    });
    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });
    appDatabaseUrl.grantRead(instanceRole);

    const connector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      vpcConnectorName: "rva4neva-olympics",
      subnets: vpc.publicSubnets.map((subnet) => subnet.subnetId),
      securityGroups: [appSecurityGroup.securityGroupId],
    });

    // One instance always running, two at most: the cap keeps a runaway request storm
    // from turning into a large bill.
    const scaling = new apprunner.CfnAutoScalingConfiguration(this, "Scaling", {
      autoScalingConfigurationName: "rva4neva-olympics",
      minSize: 1,
      maxSize: 2,
      maxConcurrency: 100,
    });

    const service = new apprunner.CfnService(this, "Service", {
      serviceName: "rva4neva-olympics",
      sourceConfiguration: {
        // Deploys are explicit (scripts/deploy.ts), never triggered by a push to the registry.
        autoDeploymentsEnabled: false,
        authenticationConfiguration: { accessRoleArn: accessRole.roleArn },
        imageRepository: {
          imageRepositoryType: "ECR",
          imageIdentifier: `${repository.repositoryUri}:${props.imageTag}`,
          imageConfiguration: {
            port: "8080",
            runtimeEnvironmentVariables: [
              // Two instances at most, so a few connections each is comfortably within
              // what even a small Aurora allows.
              { name: "DATABASE_POOL_MAX", value: "4" },
            ],
            // App Runner fetches this at startup, so a changed value needs a new deployment.
            runtimeEnvironmentSecrets: [{ name: "DATABASE_URL", value: appDatabaseUrl.secretArn }],
          },
        },
      },
      // 0.25 vCPU with 1 GB. The site is light, but next/image decodes whole photos in
      // memory, and one large phone photo would be uncomfortable in half a gigabyte.
      instanceConfiguration: { cpu: "256", memory: "1024", instanceRoleArn: instanceRole.roleArn },
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/api/health", // answers without touching the database, so a sleeping Aurora is not a failure
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      networkConfiguration: {
        // All outbound traffic goes through the VPC, which is how the app reaches Aurora.
        egressConfiguration: { egressType: "VPC", vpcConnectorArn: connector.attrVpcConnectorArn },
        ingressConfiguration: { isPubliclyAccessible: true },
      },
      autoScalingConfigurationArn: scaling.attrAutoScalingConfigurationArn,
    });
    // IAM changes take a moment to be visible everywhere; without this the first deploy
    // can fail with a "role not ready" error.
    service.node.addDependency(accessRole, instanceRole);

    // --- what the scripts need to know --------------------------------------------------------
    new cdk.CfnOutput(this, "ServiceUrl", { value: `https://${service.attrServiceUrl}` });
    new cdk.CfnOutput(this, "ServiceArn", { value: service.attrServiceArn });
    new cdk.CfnOutput(this, "DatabaseEndpoint", { value: database.clusterEndpoint.hostname });
    new cdk.CfnOutput(this, "DatabaseMasterSecretArn", { value: database.secret!.secretArn });
    new cdk.CfnOutput(this, "AppDatabaseUrlSecretArn", { value: appDatabaseUrl.secretArn });
  }
}
