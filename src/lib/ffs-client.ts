/**
 * Client for feature-flag-service. One file, no dependencies: copy it into a site.
 * (HANDOFF.md §11.) It replaces a LaunchDarkly client and keeps its guarantees:
 *
 *  - `boolFlag(key, fallback)` never throws. Every failure resolves to a value.
 *  - A snapshot younger than `ttlMs` (default 15 s) is used without a request. Changes made in the
 *    dashboard therefore reach a site within about that long.
 *  - An older snapshot is returned immediately and refreshed in the background (stale-while-
 *    revalidate), so a warm site's page loads never wait on the flag service. Concurrent refreshes
 *    share one request, and an unchanged snapshot costs a 304 (If-None-Match).
 *  - Optional check-on-read (`freshWaitMs` > 0): once the snapshot is older than `ttlMs`, a read waits up to
 *    that long for a fresh answer, then uses whatever it has. With `ttlMs: 0` every read checks, so a change
 *    shows on the very next read. A circuit breaker keeps an outage cheap: after a failed or too-slow check,
 *    reads skip the wait for `failureBackoffMs` and answer from the last good values at once.
 *  - With no snapshot yet, only the first call waits (up to `requestTimeoutMs`, default 5 s). If
 *    that fails, calls return their fallback at once until a fetch succeeds, so an outage never
 *    slows every page.
 *  - If the service goes away after a good fetch, the last good values are served indefinitely.
 *  - A flag missing from the snapshot answers with its fallback.
 *
 * Configuration comes from FLAG_SERVICE_URL and FLAG_SERVICE_SDK_KEY, plus the optional
 * FLAG_SERVICE_TTL_MS and FLAG_SERVICE_FRESH_WAIT_MS. With either of the first two unset (or the
 * "not-provisioned-yet" placeholder), every flag answers with its fallback and one warning is logged.
 */

export interface FlagClientOptions {
  /** The service's base URL, e.g. https://flags.example.com */
  url: string;
  /** An environment's SDK key (ffs_sdk_…). */
  sdkKey: string;
  /** How long a snapshot is used without asking again. Default 15 000 ms. */
  ttlMs?: number;
  /**
   * Check-on-read. When the snapshot is older than `ttlMs`, wait up to this many ms for a fresh answer
   * before using the saved copy. 0 (the default) never waits: stale-while-revalidate.
   */
  freshWaitMs?: number;
  /** After a failed or too-slow check, skip the wait (and don't retry) for this long. Default 5 000 ms. */
  failureBackoffMs?: number;
  /** How long one request may take, which is also how long the first call may wait. Default 5 000 ms. */
  requestTimeoutMs?: number;
  /** For tests. */
  fetch?: typeof fetch;
  /** For tests. */
  now?: () => number;
  /** Where warnings go. Default console.warn. */
  warn?: (message: string) => void;
}

export interface FlagClient {
  boolFlag(key: string, fallback: boolean): Promise<boolean>;
}

interface Snapshot {
  flags: Record<string, boolean>;
  version: number;
  checkedAt: number;
}

const WARN_EVERY_MS = 60_000;

export function createFlagClient(options: FlagClientOptions): FlagClient {
  const ttlMs = options.ttlMs ?? 15_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  const freshWaitMs = Math.max(0, options.freshWaitMs ?? 0);
  const failureBackoffMs = options.failureBackoffMs ?? 5_000;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const endpoint = `${options.url.replace(/\/+$/, "")}/api/sdk/v1/flags`;

  let snapshot: Snapshot | null = null;
  let inflight: Promise<void> | null = null;
  let waited = false;
  let lastAttemptAt = -Infinity;
  let lastWarnAt = -Infinity;
  // Check-on-read circuit breaker: until this time, reads don't wait for a check.
  let breakerOpenUntil = 0;

  function warnSometimes(message: string) {
    if (now() - lastWarnAt < WARN_EVERY_MS) return;
    lastWarnAt = now();
    warn(message);
  }

  async function fetchOnce(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${options.sdkKey}`, Accept: "application/json" };
      if (snapshot) headers["If-None-Match"] = `"${snapshot.version}"`;
      const response = await doFetch(endpoint, { headers, signal: controller.signal, cache: "no-store" });

      if (response.status === 304 && snapshot) {
        snapshot = { ...snapshot, checkedAt: now() };
        return;
      }
      if (!response.ok) throw new Error(`the flag service answered ${response.status}`);

      const body = (await response.json()) as { version?: unknown; flags?: unknown };
      if (typeof body.version !== "number" || typeof body.flags !== "object" || body.flags === null) {
        throw new Error("the flag service sent an unexpected response");
      }
      const flags: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(body.flags)) if (typeof value === "boolean") flags[key] = value;
      snapshot = { flags, version: body.version, checkedAt: now() };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Start a refresh unless one is running. Concurrent callers share it. Never rejects. */
  function refresh(): Promise<void> {
    if (inflight) return inflight;
    lastAttemptAt = now();
    inflight = fetchOnce()
      .then(() => {
        breakerOpenUntil = 0; // the service answered: waiting is worth it again
      })
      .catch((error: unknown) => {
        breakerOpenUntil = now() + failureBackoffMs;
        const reason = (error as Error)?.name === "AbortError" ? "the request timed out" : ((error as Error)?.message ?? String(error));
        warnSometimes(
          snapshot
            ? `Feature flags couldn't refresh (${reason}). Serving the last values.`
            : `Feature flags couldn't be loaded (${reason}). Using fallbacks.`,
        );
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  /** Whether a new check may start now. A failed attempt waits a TTL (and, with check-on-read, the breaker). */
  const mayStartRefresh = () =>
    !inflight && now() - lastAttemptAt >= ttlMs && (freshWaitMs === 0 || now() >= breakerOpenUntil);

  /** Resolves true when `promise` settles within `ms`, false if the wait ran out first. */
  function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      void promise.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  return {
    async boolFlag(key, fallback) {
      try {
        if (snapshot) {
          if (now() - snapshot.checkedAt >= ttlMs) {
            if (freshWaitMs > 0 && now() >= breakerOpenUntil) {
              // Check on read: ask now (or join the check already running) and give it a short wait.
              if (mayStartRefresh()) void refresh();
              if (inflight && !(await settlesWithin(inflight, freshWaitMs))) {
                // Too slow: stop making reads wait for a while. The check carries on in the background.
                breakerOpenUntil = now() + failureBackoffMs;
              }
            } else if (mayStartRefresh()) {
              // Stale-while-revalidate: answer now, refresh behind the scenes.
              void refresh();
            }
          }
        } else if (!waited) {
          // Only the first call waits for the first fetch.
          try {
            await refresh();
          } finally {
            waited = true;
          }
        } else if (mayStartRefresh()) {
          // Still no snapshot: keep trying in the background, answer with the fallback meanwhile.
          void refresh();
        }
        const value = snapshot?.flags[key];
        return typeof value === "boolean" ? value : fallback;
      } catch (error) {
        warnSometimes(`Feature flag "${key}" fell back to ${fallback}: ${(error as Error).message}`);
        return fallback;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Ready-made, configured from the environment
// ---------------------------------------------------------------------------------------------

/** What an infrastructure stack may write into the secret until a real key is set. */
const KEY_PLACEHOLDER = "not-provisioned-yet";

// Next's dev server re-evaluates modules on every edit; without this a new client (and a cold
// cache) would be created on each one. A missing configuration is not cached, so setting the
// variables takes effect without a restart.
const globalForFfs = globalThis as unknown as {
  __ffsClient?: { id: string; client: FlagClient };
  __ffsWarnedUnset?: boolean;
};

/** A non-negative whole number from the environment, or undefined if unset or not one. */
function msFromEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

/**
 * Evaluate a boolean flag using FLAG_SERVICE_URL and FLAG_SERVICE_SDK_KEY. Never throws.
 * Optional: FLAG_SERVICE_TTL_MS (default 15000) and FLAG_SERVICE_FRESH_WAIT_MS (default 0, off). For
 * check-on-read, set TTL_MS=0 and FRESH_WAIT_MS=250.
 */
export async function boolFlag(key: string, fallback: boolean): Promise<boolean> {
  try {
    const url = process.env.FLAG_SERVICE_URL?.trim();
    const sdkKey = process.env.FLAG_SERVICE_SDK_KEY?.trim();
    if (!url || !sdkKey || sdkKey === KEY_PLACEHOLDER) {
      if (!globalForFfs.__ffsWarnedUnset) {
        globalForFfs.__ffsWarnedUnset = true;
        console.warn("FLAG_SERVICE_URL or FLAG_SERVICE_SDK_KEY is not set. Feature flags will use their default values.");
      }
      return fallback;
    }
    const ttlMs = msFromEnv("FLAG_SERVICE_TTL_MS");
    const freshWaitMs = msFromEnv("FLAG_SERVICE_FRESH_WAIT_MS");
    const id = `${url}|${sdkKey}|${ttlMs}|${freshWaitMs}`;
    if (globalForFfs.__ffsClient?.id !== id) {
      globalForFfs.__ffsClient = { id, client: createFlagClient({ url, sdkKey, ttlMs, freshWaitMs }) };
    }
    return await globalForFfs.__ffsClient.client.boolFlag(key, fallback);
  } catch (error) {
    console.warn(`Feature flag "${key}" fell back to ${fallback}: ${(error as Error).message}`);
    return fallback;
  }
}
