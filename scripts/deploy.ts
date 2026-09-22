import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CDK_DIR,
  REGISTRY_STACK,
  ROOT,
  SITE_STACK,
  awsContext,
  awsJson,
  capture,
  deleteSsmParameter,
  detectPublicIp,
  fail,
  flag,
  getSsmParameter,
  messageOf,
  option,
  putSsmParameter,
  run,
  stackStatus,
  step,
  type AwsContext,
} from "./aws";

/**
 * Deploy the site to AWS: build the image, push it, and create or update the stacks.
 *
 *   npm run deploy                        deploy the current code
 *   npm run deploy -- --bootstrap         also run `cdk bootstrap` (once per account and region)
 *   npm run deploy -- --admin-ip=1.2.3.4  let this address reach the database (default: yours)
 *   npm run deploy -- --no-admin-ip       let nothing but the app reach the database
 *   npm run deploy -- --dry-run           check everything and say what would happen; change nothing
 *   npm run deploy -- --build-only        build the image for AWS and stop; needs no AWS account
 *   npm run deploy -- --ci                run as GitHub Actions does; see below
 *
 * The order matters. App Runner will not create a service whose image does not exist, so
 * the registry stack goes first, then the image, then everything else.
 *
 * --ci changes one thing: where the admin IP comes from. A laptop run detects this
 * machine's address (or takes --admin-ip) and saves it to SSM, so the database's
 * firewall rule always reflects wherever you deployed from last. A CI run has no
 * meaningful "this machine" to detect — a GitHub runner's address is different every
 * time and reaching nothing you'd ever want to reach directly — so it reads that saved
 * address back instead of overwriting it with its own. This is what keeps `npm run
 * aws:db` and `psql` working from your laptop even though CI deploys the site. --ci is
 * implied by GITHUB_ACTIONS=true, which the workflow sets, so it does not need typing.
 *
 * A laptop run finishes by running `npm run aws:db` itself — safe to do every time, and
 * it is how the database picks up a migration without a second command to remember. CI
 * never does this: DeployRole cannot reach the database or read its credentials at all,
 * on purpose. A separate `migrate` job in the workflow does that instead, only when a
 * push touches drizzle/, as MigrateRole (infra/cdk/lib/ci-stack.ts) — see infra/aws.md.
 */

const REPOSITORY = "rva4neva-olympics";
const BASE_IMAGE = "node:22-alpine";
const BOOTSTRAP_QUALIFIER = "hnb659fds"; // CDK's default
const ADMIN_IP_PARAMETER = "/rva4neva-olympics/admin-ip";

const dryRun = flag("dry-run");
const buildOnly = flag("build-only");
const ci = flag("ci") || process.env.GITHUB_ACTIONS === "true";

/** Environment for the CDK CLI. */
function cdkEnv(context: AwsContext) {
  return { ...context.env, JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION: "1", CDK_DISABLE_VERSION_CHECK: "1" };
}

/** Short git commit id, so an image tag says which code is in it. */
function imageTag(): { tag: string; reusable: boolean } {
  let commit: string;
  let dirty: boolean;
  try {
    commit = capture("git", ["rev-parse", "--short=12", "HEAD"]);
    dirty = capture("git", ["status", "--porcelain"]).length > 0;
  } catch {
    commit = "nogit";
    dirty = true;
  }
  if (!dirty) return { tag: commit, reusable: true };
  // Uncommitted changes make the tag ambiguous, so every such build gets its own.
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return { tag: `${commit}-dirty-${stamp}`, reusable: false };
}

function hasBuildx(): boolean {
  try {
    capture("docker", ["buildx", "version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the image for x86 (linux/amd64), which is what App Runner runs.
 *
 * With `docker buildx` this is one flag. Without it, Docker's classic builder cannot reuse
 * an ARM `node:22-alpine` it already has on an Apple-silicon Mac, and refuses. Pinning the
 * base image by the digest of its x86 variant gets around that. (Not the digest that
 * `docker pull` prints, which names the multi-platform index and resolves to the host's own
 * architecture again.)
 */
function buildImage(reference: string) {
  const args = ["build", "--platform", "linux/amd64", "-t", reference];
  if (!hasBuildx()) {
    let digest: string | undefined;
    try {
      capture("docker", ["pull", "--platform", "linux/amd64", BASE_IMAGE]);
      digest = capture("docker", ["image", "inspect", "--platform", "linux/amd64", "--format", "{{.Id}}", BASE_IMAGE]);
    } catch (error) {
      fail(`Could not find the x86 variant of ${BASE_IMAGE}: ${messageOf(error)}\nInstalling buildx avoids this: brew install docker-buildx`);
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail(`Unexpected image id for ${BASE_IMAGE}: ${digest}\nInstalling buildx avoids this: brew install docker-buildx`);
    args.push("--build-arg", `NODE_IMAGE=${BASE_IMAGE}@${digest}`);
  }
  run("docker", [...args, "."], { cwd: ROOT });
}

function ensureCdkInstalled() {
  try {
    capture("node", ["-e", "require.resolve('aws-cdk-lib')"], { env: { ...process.env, NODE_PATH: path.join(CDK_DIR, "node_modules") } });
  } catch {
    step("Installing the CDK package (infra/cdk)");
    run("npm", ["ci"], { cwd: CDK_DIR });
  }
}

function bootstrapVersion(context: AwsContext): string | undefined {
  try {
    return capture(
      "aws",
      ["ssm", "get-parameter", "--name", `/cdk-bootstrap/${BOOTSTRAP_QUALIFIER}/version`, "--query", "Parameter.Value", "--output", "text"],
      { env: context.env },
    );
  } catch (error) {
    if (/ParameterNotFound/.test(messageOf(error))) return undefined;
    throw error;
  }
}

async function main() {
  try {
    capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  } catch {
    fail("Docker is not running. Start it (Docker Desktop, or `colima start`) and try again.");
  }

  const { tag, reusable } = imageTag();

  if (buildOnly) {
    step(`Building ${REPOSITORY}:${tag} for linux/amd64 (no AWS involved)`);
    buildImage(`${REPOSITORY}:${tag}`);
    console.log(`\n✓ Built ${REPOSITORY}:${tag}. Nothing was pushed or deployed.`);
    return;
  }

  step("Checking your AWS session");
  const context = awsContext();
  console.log(`  account ${context.account}, region ${context.region}`);

  step("Checking that CDK is set up in this account");
  const version = bootstrapVersion(context);
  if (version) {
    console.log(`  bootstrapped (version ${version})`);
  } else if (flag("bootstrap")) {
    console.log("  not bootstrapped yet; doing it now (one time, creates a small staging bucket and roles)");
    if (!dryRun) {
      ensureCdkInstalled();
      run("npx", ["cdk", "bootstrap", `aws://${context.account}/${context.region}`], { cwd: CDK_DIR, env: cdkEnv(context) });
    }
  } else {
    fail(
      `CDK has not been set up in account ${context.account}, region ${context.region}.\n` +
        "Run this once, which creates a small staging bucket and a few roles:\n\n  npm run deploy -- --bootstrap",
    );
  }

  step("Checking the last attempt did not leave a broken stack behind");
  const siteStatus = stackStatus(context, SITE_STACK);
  if (siteStatus === "ROLLBACK_COMPLETE") {
    // CloudFormation cannot update a stack whose creation failed: it holds no resources and
    // only the empty shell remains. Deleting it is the documented way forward.
    fail(
      `A previous first deploy failed, leaving an empty ${SITE_STACK} stack that cannot be updated.\n` +
        "Delete it (it holds nothing; the database, if one was created, kept a final snapshot), then deploy again:\n\n" +
        `  aws cloudformation delete-stack --stack-name ${SITE_STACK} --region ${context.region}\n` +
        `  aws cloudformation wait stack-delete-complete --stack-name ${SITE_STACK} --region ${context.region}`,
    );
  }
  console.log(siteStatus ? `  ${SITE_STACK} is ${siteStatus}` : `  ${SITE_STACK} does not exist yet; this is the first deploy`);

  step("Working out who may reach the database directly");
  let adminIp: string | undefined;
  if (ci) {
    // Never detect: a runner's own address is meaningless to save, and would overwrite
    // the laptop address that migrations and psql actually depend on.
    adminIp = getSsmParameter(context, ADMIN_IP_PARAMETER);
    console.log(
      adminIp
        ? `  ${adminIp} (read from SSM; set by the last laptop deploy).`
        : `  nothing saved at ${ADMIN_IP_PARAMETER}. Only the app will be able to reach the database.`,
    );
  } else {
    adminIp = flag("no-admin-ip") ? undefined : (option("admin-ip") ?? (await detectPublicIp()));
    if (adminIp && !/^\d{1,3}(\.\d{1,3}){3}$/.test(adminIp)) fail(`--admin-ip must be an IPv4 address, not "${adminIp}".`);
    console.log(
      adminIp
        ? `  ${adminIp}. Only this address and the app can reach the database.`
        : flag("no-admin-ip")
          ? "  no one but the app (--no-admin-ip). Migrations and psql from a laptop will not work."
          : "  could not detect this machine's address, so only the app will be able to reach the database.\n" +
            "  (Pass --admin-ip=1.2.3.4 if you need to run migrations from here.)",
    );
    // Persisted so a later CI deploy reads the same address back instead of losing it.
    if (!dryRun) {
      if (adminIp) putSsmParameter(context, ADMIN_IP_PARAMETER, adminIp);
      else deleteSsmParameter(context, ADMIN_IP_PARAMETER);
    }
  }

  const ecrHost = `${context.account}.dkr.ecr.${context.region}.amazonaws.com`;
  const reference = `${ecrHost}/${REPOSITORY}:${tag}`;

  if (dryRun) {
    console.log("\nDry run: nothing was changed. A real run would:");
    console.log(`  1. create or update the ${REGISTRY_STACK} stack (the image registry)`);
    console.log(`  2. build ${reference} for linux/amd64 and push it${reusable ? " (skipped if that tag already exists)" : ""}`);
    console.log(`  3. create or update the ${SITE_STACK} stack (network, database, App Runner) with that image`);
    return;
  }

  ensureCdkInstalled();

  step("Deploying the image registry");
  run("npx", ["cdk", "deploy", REGISTRY_STACK, "--require-approval", "never"], { cwd: CDK_DIR, env: cdkEnv(context) });

  step("Checking whether this exact code is already in the registry");
  let alreadyPushed = false;
  if (reusable) {
    try {
      awsJson(context, ["ecr", "describe-images", "--repository-name", REPOSITORY, "--image-ids", `imageTag=${tag}`]);
      alreadyPushed = true;
    } catch (error) {
      if (!/ImageNotFoundException/.test(messageOf(error))) throw error;
    }
  }

  if (alreadyPushed) {
    console.log(`  ${REPOSITORY}:${tag} is already there; reusing it.`);
  } else {
    step(`Building ${REPOSITORY}:${tag} for linux/amd64`);
    buildImage(reference);

    step("Pushing to the registry");
    const password = capture("aws", ["ecr", "get-login-password"], { env: context.env });
    capture("docker", ["login", "--username", "AWS", "--password-stdin", ecrHost], { input: password });
    run("docker", ["push", reference]);
  }

  step("Deploying the site (the first time takes 10 to 15 minutes, mostly the database)");
  const scratch = mkdtempSync(path.join(tmpdir(), "olympics-deploy-"));
  const outputsFile = path.join(scratch, "outputs.json");
  try {
    const contextArgs = ["-c", `imageTag=${tag}`, ...(adminIp ? ["-c", `adminIp=${adminIp}`] : [])];
    run("npx", ["cdk", "deploy", SITE_STACK, "--require-approval", "never", "--outputs-file", outputsFile, ...contextArgs], {
      cwd: CDK_DIR,
      env: cdkEnv(context),
    });

    const outputs = (JSON.parse(readFileSync(outputsFile, "utf8")) as Record<string, Record<string, string>>)[SITE_STACK] ?? {};
    console.log(`\n✓ Deployed ${tag}.\n\n  Site:      ${outputs.ServiceUrl}`);

    // CI stops here: DeployRole cannot reach the database or read its credentials, by
    // design (see the file header). The workflow's separate `migrate` job picks this up,
    // using MigrateRole instead, only when this push touched drizzle/.
    //
    // A laptop that still has an admin IP rule can reach the database — the step above
    // just made sure of it — so it finishes the job itself rather than leaving a second
    // command to remember. Safe to run every time: migrations apply only what is new,
    // table permissions are just re-asserted, and the events/roster load only when the
    // database has none. Skipped, not attempted and left to fail, when this deploy left
    // no admin IP allowed through (--no-admin-ip, or address detection failed): there is
    // nothing this machine could reach right now regardless.
    if (!ci && adminIp) {
      run("npx", ["tsx", "scripts/aws-db.ts"], { cwd: ROOT, env: context.env });
    } else if (!ci) {
      console.log("\n  No admin IP is allowed through this time, so the database step was skipped.\n  Run `npm run aws:db` once this machine can reach it again.");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
