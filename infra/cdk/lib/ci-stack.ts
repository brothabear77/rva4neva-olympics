import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { REPOSITORY_NAME } from "./olympics-stack";

export interface CiStackProps extends cdk.StackProps {
  /** GitHub login of the repository owner, e.g. "brothabear77". */
  githubOwner: string;
  /** That account's numeric, permanent GitHub user id. See the comment below for why. */
  githubOwnerId: string;
  /** Repository name only, e.g. "rva4neva-olympics" (no owner prefix). */
  githubRepoName: string;
  /** That repository's numeric, permanent GitHub id. See the comment below for why. */
  githubRepoId: string;
  /** Only this branch may assume the role. A push to any other ref is refused. */
  branch: string;
}

/**
 * Two IAM roles that GitHub Actions can assume, and nothing else.
 *
 * There is no access key here. GitHub's runner presents a short-lived OIDC token for
 * each job, and these roles trust that token — but only when it says it was minted for
 * a push to this exact repository and branch. A workflow running for a pull request,
 * or from a fork, or on any other branch, gets refused before it can call AWS at all.
 *
 * DeployRole ships the app: it can push an image and update the stacks, but it cannot
 * read the database's credentials or reach it — a compromised dependency in a routine
 * deploy is limited to shipping bad app code, not touching the database directly.
 *
 * MigrateRole is the one exception, assumed only by the workflow's `migrate` job, which
 * itself only runs when a push changes `drizzle/`. It can read the database owner's
 * secret and briefly open the database's security group to the runner's own IP — the
 * same thing a laptop deploy's admin-ip does, just scoped to one job instead of left
 * open. Splitting this into its own role, rather than widening DeployRole, means an
 * ordinary code-only deploy never even has the option of touching the database owner's
 * credentials, whatever runs during it.
 *
 * This stack is deployed by hand, once: `npx cdk deploy OlympicsCi`. CI cannot create
 * the roles it would need in order to run itself.
 */
export class CiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);

    // Every AWS account gets at most one OIDC provider per issuer URL. This one was
    // created outside this project (for github-lambda-deploy, on 2026-06-30) and is
    // shared here rather than duplicated — creating a second for the same URL fails.
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidc",
      `arn:aws:iam::${cdk.Stack.of(this).account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    // This account (or org) has GitHub's "immutable OIDC subject claims" enabled, which
    // adds the owner's and repository's permanent numeric ids to the `sub` claim:
    //
    //   repo:brothabear77@297315939/rva4neva-olympics@1377670854:ref:refs/heads/main
    //
    // instead of the plain repo:owner/name:ref:... form the AWS and GitHub docs lead
    // with. It exists so a deleted-then-recreated repo, or a renamed account, can never
    // inherit another workflow's trust — the ids never change or get reused, unlike
    // names. Confirmed against this account by reading a failed AssumeRoleWithWebIdentity
    // call in CloudTrail (a first version of this policy, matching only on names, was
    // refused with AccessDenied) and cross-checked with `gh api user` and
    // `gh api repos/<owner>/<repo>`. This is also why the account's other GitHub role,
    // github-lambda-deploy, resorts to a wildcarded StringLike rather than an exact
    // match — it predates this being worked out. Using the real ids here keeps the
    // exact-match property that wildcard gives up.
    const subject = `repo:${props.githubOwner}@${props.githubOwnerId}/${props.githubRepoName}@${props.githubRepoId}:ref:refs/heads/${props.branch}`;
    const trust = new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": subject,
      },
    });

    const role = new iam.Role(this, "DeployRole", {
      roleName: "rva4neva-olympics-github-deploy",
      description: "Assumed by GitHub Actions to deploy rva4neva-olympics. Scoped to one repo and branch.",
      assumedBy: trust,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // What scripts/deploy.ts actually calls, and nothing more.
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkRoles",
        actions: ["sts:AssumeRole"],
        // CDK's bootstrap roles: deploy, file-publishing, image-publishing, lookup.
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrAuth",
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"], // this action does not support resource scoping
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrPush",
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
        ],
        resources: [`arn:aws:ecr:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:repository/${REPOSITORY_NAME}`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "DescribeStacks",
        actions: ["cloudformation:DescribeStacks"],
        resources: [
          `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/OlympicsSite/*`,
          `arn:aws:cloudformation:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stack/OlympicsRegistry/*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadSsmParameters",
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/cdk-bootstrap/hnb659fds/version`,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/rva4neva-olympics/admin-ip`,
        ],
      }),
    );

    new cdk.CfnOutput(this, "DeployRoleArn", { value: role.roleArn });

    // --- the migrate role: read the database owner's secret, open the database briefly ---
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const migrateRole = new iam.Role(this, "MigrateRole", {
      roleName: "rva4neva-olympics-github-migrate",
      description:
        "Assumed by GitHub Actions only when a push changes drizzle/, to apply the migration. " +
        "Scoped to one repo and branch, same as DeployRole.",
      assumedBy: trust,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Secret names are fixed (SiteStack), but Secrets Manager appends a random suffix to
    // every ARN, so the exact ARN cannot be written here — only this account's stacks
    // can create either secret, so the name prefix is enough to scope it to them.
    const masterSecretPattern = `arn:aws:secretsmanager:${region}:${account}:secret:rva4neva/database-master-*`;
    const appSecretPattern = `arn:aws:secretsmanager:${region}:${account}:secret:rva4neva/app-database-url-*`;
    migrateRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadDatabaseCredentials",
        actions: ["secretsmanager:GetSecretValue"],
        resources: [masterSecretPattern, appSecretPattern],
      }),
    );
    migrateRole.addToPolicy(
      new iam.PolicyStatement({
        // Only the app's own secret can be written — never the owner's. Rotating the app
        // role's password on a normal migration run would work either way; overwriting
        // the master secret would lock the owner out.
        sid: "WriteAppCredential",
        actions: ["secretsmanager:PutSecretValue"],
        resources: [appSecretPattern],
      }),
    );

    // Opening and closing the database's firewall for the run's own IP, the same thing
    // deploy.ts does for a laptop's admin-ip, just scoped to this one group by tag rather
    // than by id — this stack is deployed separately from SiteStack and cannot reference
    // the security group's generated id directly. See DatabaseSecurityGroup's own comment.
    migrateRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "OpenDatabaseTemporarily",
        actions: ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"],
        resources: [`arn:aws:ec2:${region}:${account}:security-group/*`],
        conditions: { StringEquals: { "aws:ResourceTag/Name": "rva4neva-olympics-database" } },
      }),
    );
    migrateRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DescribeStacks",
        actions: ["cloudformation:DescribeStacks"],
        resources: [`arn:aws:cloudformation:${region}:${account}:stack/OlympicsSite/*`],
      }),
    );
    migrateRole.addToPolicy(
      new iam.PolicyStatement({
        // Restarts the app after saving its (possibly rotated) login, same as a laptop's
        // `npm run aws:db` does; and checks the restart succeeded.
        sid: "RestartApp",
        actions: ["apprunner:StartDeployment", "apprunner:ListOperations"],
        resources: [`arn:aws:apprunner:${region}:${account}:service/rva4neva-olympics/*`],
      }),
    );

    new cdk.CfnOutput(this, "MigrateRoleArn", { value: migrateRole.roleArn });
  }
}
