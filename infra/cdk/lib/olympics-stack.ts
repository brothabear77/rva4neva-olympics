import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { FckNatInstanceProvider } from "cdk-fck-nat";
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
    // Two availability zones (Aurora insists on two), and two kinds of subnet:
    //
    //   public   Aurora, and the NAT instance. Public because the database is reachable
    //            from your laptop, which needs a route to the internet. What actually
    //            protects the database is its security group below, not the subnet type.
    //   private  The app's VPC connector only. Its default route goes through the NAT
    //            instance, which is the app's one way out to the internet — needed for
    //            LaunchDarkly (feature flags, src/lib/flags.ts) and Spotify (walkout song
    //            search, src/lib/spotify.ts), both plain HTTPS. It still reaches Aurora
    //            directly over the VPC's own local route.
    //
    // A NAT *instance* (fck-nat on a t4g.nano, roughly $3 a month plus its public IPv4
    // address), not a managed NAT gateway (about $32 a month) for two small streams of
    // traffic. It is self-healing: an Auto Scaling group holds exactly one instance,
    // and the private subnets route to a fixed network interface that whichever instance
    // is running attaches at boot, so a replacement needs no route change. If it is down,
    // running app instances keep their last flag values and new ones fall back to "open";
    // song search says it couldn't reach Spotify (songs already chosen still play, since
    // the player loads in the visitor's browser).
    //
    // The AMI is pinned rather than looked up: a lookup needs AWS credentials at synth
    // time, and CI synthesizes without any. To update, take the newest ID from
    //   aws ec2 describe-images --owners 568608671756 \
    //     --filters "Name=name,Values=fck-nat-al2023-*-arm64-ebs" \
    //     --query 'sort_by(Images,&CreationDate)[-1].ImageId'
    //
    // The private group is listed after the public one on purpose: subnets get their
    // address ranges in this order, so appending never moves the existing public subnets
    // (and Aurora with them).
    const natProvider = new FckNatInstanceProvider({
      instanceType: new ec2.InstanceType("t4g.nano"),
      machineImage: ec2.MachineImage.genericLinux({ "us-east-1": "ami-057efe8665d31018f" }), // fck-nat 1.4.0, 2026-07-01
    });
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: natProvider,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // --- who may talk to the database ---------------------------------------------------
    const appSecurityGroup = new ec2.SecurityGroup(this, "AppSecurityGroup", {
      vpc,
      description: "App Runner instances, through the VPC connector",
      allowAllOutbound: true,
    });
    // The NAT instance's own security group admits nothing by default. HTTPS from the app
    // is all that has to pass through it.
    natProvider.securityGroup.addIngressRule(appSecurityGroup, ec2.Port.tcp(443), "App Runner, HTTPS out through the NAT");

    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc,
      // GroupDescription is immutable in CloudFormation — changing this text would replace
      // the group (and cascade into its ingress rules and the cluster's SG reference), so
      // it stays exactly as first deployed even though a CI run now also opens it briefly.
      description: "Aurora: the app, and one admin IP address. Nothing else.",
      allowAllOutbound: false,
    });
    // A tag, not a fixed securityGroupName (also immutable, also a replacement): stable
    // enough for OlympicsCi's IAM condition below, which is deployed separately and by
    // hand, so it cannot reference this group's generated id directly. A tag update alone
    // applies in place.
    cdk.Tags.of(databaseSecurityGroup).add("Name", "rva4neva-olympics-database");
    databaseSecurityGroup.addIngressRule(appSecurityGroup, ec2.Port.tcp(5432), "The app");
    if (props.adminIp) {
      databaseSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(`${props.adminIp}/32`),
        ec2.Port.tcp(5432),
        "Admin machine: migrations and psql",
      );
    }
    // CI opens and closes its own rule here at migration time (scripts/aws-db.ts --ci) —
    // it is not declared here because its IP is only known for the ~minute a job runs.

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

    // --- LaunchDarkly -----------------------------------------------------------------------
    //
    // The server-side SDK key for LaunchDarkly's Production environment. Set by hand once
    // (see "Feature flags" in infra/aws.md); CloudFormation only ever writes the
    // placeholder, which the app treats the same as no key: flags fall back to defaults.
    const launchDarklySdkKey = new secretsmanager.Secret(this, "LaunchDarklySdkKey", {
      secretName: "rva4neva/launchdarkly-sdk-key",
      description: "LaunchDarkly server-side SDK key (Production environment). Set by hand; see infra/aws.md.",
      secretStringValue: cdk.SecretValue.unsafePlainText("not-provisioned-yet"),
    });

    // --- Spotify ------------------------------------------------------------------------------
    //
    // The app's Client ID and Secret from the Spotify developer dashboard, for looking up
    // walkout songs. One JSON secret with two keys, set by hand once (see "Walkout songs" in
    // infra/aws.md); CloudFormation only ever writes the placeholders, which the app treats
    // the same as no credentials: song search is switched off and the rest of the site is
    // unaffected.
    const spotifyCredentials = new secretsmanager.Secret(this, "SpotifyCredentials", {
      secretName: "rva4neva/spotify-credentials",
      description: 'Spotify app credentials, as JSON {"clientId": "…", "clientSecret": "…"}. Set by hand; see infra/aws.md.',
      secretObjectValue: {
        clientId: cdk.SecretValue.unsafePlainText("not-provisioned-yet"),
        clientSecret: cdk.SecretValue.unsafePlainText("not-provisioned-yet"),
      },
    });

    // --- App Runner ------------------------------------------------------------------------
    // The access role lets App Runner pull the image from the registry. The instance role is
    // what the running app is allowed to do: read its secrets, read and write the Vlog
    // bucket, and nothing else.
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
    launchDarklySdkKey.grantRead(instanceRole);
    spotifyCredentials.grantRead(instanceRole);

    // --- Vlog videos ------------------------------------------------------------------------
    // Private: nothing is public. The browser uploads and plays videos with short-lived
    // presigned URLs the app signs (src/lib/vlogMedia.ts), so the bytes never pass through
    // App Runner. It stays empty, and costs nothing, while the "show-vlog-page" flag is off.
    // RETAIN, so deleting the stack can never delete uploaded videos.
    const vlogBucket = new s3.Bucket(this, "VlogBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // The browser PUTs and GETs from the site's own origin. "*" rather than that origin
      // because the origin is App Runner's generated URL, which would make the bucket and
      // the service depend on each other. It grants nothing by itself: every request still
      // needs a signature the app only gives to signed-in athletes, and no cookies are sent.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["Content-Length", "Content-Range", "ETag"],
          maxAge: 3000,
        },
      ],
      // Half-finished uploads are not billed forever.
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
    });
    vlogBucket.grantReadWrite(instanceRole);

    // In the private subnets, so the app's outbound traffic has the NAT instance as a way
    // out. A connector's subnets cannot change in place, so changing them replaces it, and
    // replacing it is fussy in two ways, because CloudFormation creates the new connector
    // before deleting the old one:
    //
    //   - The name has to change: two connectors can't share one. Hence no longer plain
    //     "rva4neva-olympics".
    //   - The set of security groups has to change too: App Runner refuses to create a
    //     connector whose security groups exactly match an existing connector's. Hence
    //     the second group below. It has no rules of its own (the app's rules stay on
    //     appSecurityGroup, so everything that admits the app keeps working unchanged);
    //     it exists only to make this connector's set of groups unique.
    //
    // A future change to these subnets needs both tricks again: a new name, and a group
    // set that differs from this one.
    const connectorMarkerGroup = new ec2.SecurityGroup(this, "ConnectorPrivateMarker", {
      vpc,
      description: "No rules. Makes the security groups of the private-subnet VPC connector unique.",
      allowAllOutbound: false,
    });
    const connector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      vpcConnectorName: "rva4neva-olympics-private",
      subnets: vpc.privateSubnets.map((subnet) => subnet.subnetId),
      securityGroups: [appSecurityGroup.securityGroupId, connectorMarkerGroup.securityGroupId],
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
              // Not a secret. Its presence is what turns Vlog uploads on (once the flag is on too).
              { name: "VLOG_MEDIA_BUCKET", value: vlogBucket.bucketName },
              { name: "AWS_REGION", value: this.region },
            ],
            // App Runner fetches these at startup, so a changed value needs a new deployment.
            runtimeEnvironmentSecrets: [
              { name: "DATABASE_URL", value: appDatabaseUrl.secretArn },
              { name: "LAUNCHDARKLY_SDK_KEY", value: launchDarklySdkKey.secretArn },
              // "<arn>:<json key>::" is how App Runner picks one field out of a JSON secret.
              { name: "SPOTIFY_CLIENT_ID", value: `${spotifyCredentials.secretArn}:clientId::` },
              { name: "SPOTIFY_CLIENT_SECRET", value: `${spotifyCredentials.secretArn}:clientSecret::` },
            ],
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
        // All outbound traffic goes through the VPC: Aurora directly, the internet
        // (LaunchDarkly, Spotify) through the NAT instance.
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
    new cdk.CfnOutput(this, "DatabaseSecurityGroupId", { value: databaseSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, "DatabaseMasterSecretArn", { value: database.secret!.secretArn });
    new cdk.CfnOutput(this, "AppDatabaseUrlSecretArn", { value: appDatabaseUrl.secretArn });
    new cdk.CfnOutput(this, "LaunchDarklySdkKeySecretArn", { value: launchDarklySdkKey.secretArn });
    new cdk.CfnOutput(this, "VlogBucketName", { value: vlogBucket.bucketName });
    new cdk.CfnOutput(this, "SpotifyCredentialsSecretArn", { value: spotifyCredentials.secretArn });
  }
}
