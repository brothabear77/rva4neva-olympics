import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { REPOSITORY_NAME } from "./olympics-stack";

export interface CiStackProps extends cdk.StackProps {
  /** owner/repo on GitHub, e.g. "brothabear77/rva4neva-olympics". */
  githubRepo: string;
  /** Only this branch may assume the role. A push to any other ref is refused. */
  branch: string;
}

/**
 * One IAM role that GitHub Actions assumes to deploy this site, and nothing else.
 *
 * There is no access key here. GitHub's runner presents a short-lived OIDC token for
 * each job, and this role trusts that token — but only when it says it was minted for
 * a push to this exact repository and branch. A workflow running for a pull request,
 * or from a fork, or on any other branch, gets refused before it can call AWS at all.
 *
 * This stack is deployed by hand, once: `npx cdk deploy OlympicsCi`. CI cannot create
 * the role it would need in order to run itself.
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

    const role = new iam.Role(this, "DeployRole", {
      roleName: "rva4neva-olympics-github-deploy",
      description: "Assumed by GitHub Actions to deploy rva4neva-olympics. Scoped to one repo and branch.",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        // Both conditions are StringEquals, not StringLike with a wildcard: only this
        // branch, in this one repository, can ever assume this role.
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/${props.branch}`,
        },
      }),
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
  }
}
