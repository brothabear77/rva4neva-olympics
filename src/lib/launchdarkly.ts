import "server-only";
import { init, type LDClient, type LDContext } from "@launchdarkly/node-server-sdk";

/** What CloudFormation writes into the production secret until a real key is set (infra/aws.md). */
const KEY_PLACEHOLDER = "not-provisioned-yet";

function createClient(): LDClient | null {
  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY?.trim();
  if (!sdkKey || sdkKey === KEY_PLACEHOLDER) {
    console.warn("LAUNCHDARKLY_SDK_KEY is not set. Feature flags will use their default values.");
    return null;
  }
  return init(sdkKey);
}

// Next's dev server re-evaluates modules on every edit; without this a new client
// (and a new streaming connection to LaunchDarkly) would open on each one.
// A missing key is not cached, so pasting one into .env takes effect without a restart.
const globalForLd = globalThis as unknown as { __olympicsLdClient?: LDClient; __olympicsLdWaited?: boolean };

function getClient(): LDClient | null {
  if (globalForLd.__olympicsLdClient) return globalForLd.__olympicsLdClient;
  const client = createClient();
  if (client) globalForLd.__olympicsLdClient = client;
  return client;
}

/** The site has no sign-in, so every visitor evaluates flags as the same anonymous context. */
const visitor: LDContext = { kind: "user", key: "anonymous-visitor", anonymous: true };

/**
 * Evaluate a boolean flag. Never throws: if LaunchDarkly is unreachable or not
 * configured, the page renders with `fallback` instead of an error.
 *
 * Only the first call waits for the initial connection. If that times out, later
 * calls answer with `fallback` straight away instead of each stalling for the full
 * wait, which would slow every page that checks a flag while LaunchDarkly is down.
 * The client keeps retrying in the background, and once it connects, evaluation
 * starts working without a restart.
 */
export async function boolFlag(key: string, fallback: boolean): Promise<boolean> {
  const client = getClient();
  if (!client) return fallback;
  try {
    if (!client.initialized()) {
      if (globalForLd.__olympicsLdWaited) return fallback;
      try {
        await client.waitForInitialization({ timeout: 5 });
      } finally {
        globalForLd.__olympicsLdWaited = true;
      }
    }
    return await client.boolVariation(key, visitor, fallback);
  } catch (error) {
    console.warn(`LaunchDarkly flag "${key}" fell back to ${fallback}: ${(error as Error).message}`);
    return fallback;
  }
}
