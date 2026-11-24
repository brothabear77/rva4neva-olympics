import { NOT_ALLOWED, NOT_SIGNED_IN } from "./authMessages";

/**
 * The HTTP side of the iOS API, kept pure so it can be tested (src/lib/api.ts is the
 * server-only half that builds responses).
 */

/** What a failed ActionResult means over HTTP. Auth refusals have their own codes so the app can react. */
export function statusForFailure(message: string): number {
  if (message === NOT_SIGNED_IN) return 401;
  if (message === NOT_ALLOWED) return 403;
  return 400;
}

/**
 * Whether a state-changing request may proceed. The app's own requests carry no
 * Origin header; a browser always sends one on a cross-site POST, and then it must be
 * this site. This keeps the cookie the website sets from being usable by another site
 * against the API.
 */
export function originAllowed(method: string, origin: string | null, host: string | null): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
