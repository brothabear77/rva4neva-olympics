/**
 * Helpers shared by the AWS scripts (deploy.ts and aws-db.ts).
 *
 * Everything goes through the `aws` and `docker` command lines, which are already
 * installed and signed in on the machine that runs a deploy, so there is no AWS SDK
 * to add to the app's dependencies.
 */
import { execFileSync, spawnSync, type SpawnSyncOptions } from "node:child_process";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");
export const CDK_DIR = path.join(ROOT, "infra", "cdk");

export const SITE_STACK = "OlympicsSite";
export const REGISTRY_STACK = "OlympicsRegistry";
export const APP_SECRET_PLACEHOLDER = "not-provisioned-yet";

/** Print a step heading, so a long run reads as a sequence. */
export function step(message: string) {
  console.log(`\n▸ ${message}`);
}

/** Stop with a message and no stack trace: these are situations the reader can fix. */
export function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** Run a command and return what it printed. Throws, with its stderr, if it fails. */
export function capture(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; input?: string } = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** Run a command with its output shown as it happens. Stops the script if it fails. */
export function run(command: string, args: string[], options: SpawnSyncOptions = {}) {
  console.log(`  $ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} exited with status ${result.status}.`);
}

/** What went wrong in a failed `capture`, in one readable string. */
export function messageOf(error: unknown): string {
  const stderr = (error as { stderr?: Buffer | string }).stderr;
  const text = stderr ? String(stderr).trim() : "";
  return text || (error instanceof Error ? error.message : String(error));
}

/** The region to work in: the environment, then the AWS CLI's configuration, then us-east-1. */
export function resolveRegion(): string {
  const fromEnv = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (fromEnv) return fromEnv;
  try {
    const configured = capture("aws", ["configure", "get", "region"]);
    if (configured) return configured;
  } catch {
    // No region configured; fall through.
  }
  return "us-east-1";
}

export interface AwsContext {
  account: string;
  region: string;
  /** The environment every child process should run in, so they all agree on the region. */
  env: NodeJS.ProcessEnv;
}

/** Confirm the AWS CLI is signed in, and say how to fix it if it is not. */
export function awsContext(): AwsContext {
  const region = resolveRegion();
  const env = { ...process.env, AWS_REGION: region, AWS_DEFAULT_REGION: region };
  try {
    const account = capture("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"], { env });
    return { account, region, env };
  } catch (error) {
    return fail(
      `The AWS CLI is not signed in.\n\n${messageOf(error)}\n\nRun \`aws login\` (or \`aws sso login\`), then try again.`,
    );
  }
}

/** Run an AWS CLI command that prints JSON. */
export function awsJson<T>(context: AwsContext, args: string[]): T {
  return JSON.parse(capture("aws", [...args, "--output", "json"], { env: context.env })) as T;
}

/** The CloudFormation outputs of a stack, by name. Empty if the stack does not exist yet. */
export function stackOutputs(context: AwsContext, stack: string): Record<string, string> {
  try {
    const outputs = awsJson<Array<{ OutputKey: string; OutputValue: string }>>(context, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stack,
      "--query",
      "Stacks[0].Outputs",
    ]);
    return Object.fromEntries((outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
  } catch (error) {
    if (/does not exist/.test(messageOf(error))) return {};
    throw error;
  }
}

/** A stack's status, or undefined if it does not exist. */
export function stackStatus(context: AwsContext, stack: string): string | undefined {
  try {
    return capture("aws", ["cloudformation", "describe-stacks", "--stack-name", stack, "--query", "Stacks[0].StackStatus", "--output", "text"], {
      env: context.env,
    });
  } catch (error) {
    if (/does not exist/.test(messageOf(error))) return undefined;
    throw error;
  }
}

/** An SSM parameter's value, or undefined if it does not exist. */
export function getSsmParameter(context: AwsContext, name: string): string | undefined {
  try {
    return capture("aws", ["ssm", "get-parameter", "--name", name, "--query", "Parameter.Value", "--output", "text"], {
      env: context.env,
    });
  } catch (error) {
    if (/ParameterNotFound/.test(messageOf(error))) return undefined;
    throw error;
  }
}

/** Write an SSM parameter as a plain String, creating or overwriting it. */
export function putSsmParameter(context: AwsContext, name: string, value: string) {
  capture("aws", ["ssm", "put-parameter", "--name", name, "--type", "String", "--value", value, "--overwrite"], {
    env: context.env,
  });
}

/** Remove an SSM parameter. Not an error if it is already gone. */
export function deleteSsmParameter(context: AwsContext, name: string) {
  try {
    capture("aws", ["ssm", "delete-parameter", "--name", name], { env: context.env });
  } catch (error) {
    if (!/ParameterNotFound/.test(messageOf(error))) throw error;
  }
}

/** This machine's public IPv4 address, or undefined if it cannot be worked out. */
export async function detectPublicIp(): Promise<string | undefined> {
  try {
    const text = (await fetch("https://checkip.amazonaws.com", { signal: AbortSignal.timeout(8000) }).then((r) => r.text())).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** The value of `--name=value`, if given. */
export function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
