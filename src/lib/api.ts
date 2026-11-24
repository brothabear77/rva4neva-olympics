import "server-only";
import { z } from "zod";
import type { ActionResult } from "./actions";
import { originAllowed, statusForFailure } from "./apiStatus";
import { NOT_ALLOWED, NOT_SIGNED_IN } from "./authMessages";

/**
 * Shared plumbing for the iOS app's JSON API under /api/v1.
 *
 * Every route is wrapped in `api()`: it refuses cross-site writes, turns a thrown error
 * into a JSON 500, and marks every response no-store (the scoreboard is live). Success
 * bodies are the data itself; failures are `{ error: "<message for the person>" }`, with
 * 401/403 for the auth refusals so the app knows to sign in again.
 *
 * Writes go through the same server actions the website uses: they ask getSession(),
 * which accepts the app's bearer token (auth.ts), so permission checks, validation,
 * auditing and revalidation are shared rather than duplicated here.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** A server action's result as a response: its data (or `{ message }`) on success. */
export function fromAction<T>(result: ActionResult<T>): Response {
  if (!result.ok) return error(result.message, statusForFailure(result.message));
  return json(result.data === undefined ? { message: result.message } : { message: result.message, data: result.data });
}

/** Parse a JSON body against a schema; null (and a 400 to return) when it doesn't fit. */
export async function body<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S>; problem: null } | { data: null; problem: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, problem: error("The request body isn't valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, problem: error(parsed.error.issues[0]?.message ?? "Check the request and try again.") };
  }
  return { data: parsed.data, problem: null };
}

type Handler<C> = (request: Request, context: C) => Promise<Response> | Response;

export function api<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    if (!originAllowed(request.method, request.headers.get("origin"), request.headers.get("host"))) {
      return error("Cross-site requests aren't allowed.", 403);
    }
    try {
      return await handler(request, context);
    } catch (thrown) {
      console.error(`API ${request.method} ${new URL(request.url).pathname} failed:`, thrown);
      return error("Something went wrong. Try again.", 500);
    }
  };
}

/** Why the signed-in session can't see a members' page, as a response; null if it can. */
export function refuseUnlessMember(session: { role: string } | null): Response | null {
  if (!session) return error(NOT_SIGNED_IN, 401);
  if (session.role !== "athlete" && session.role !== "admin") return error(NOT_ALLOWED, 403);
  return null;
}
