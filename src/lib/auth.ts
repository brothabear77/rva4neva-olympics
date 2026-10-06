import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "./db";
import { accounts, athletes, sessions, type AccountRole } from "./schema";
import { isMigrationPending } from "./walkout";

/**
 * Who is signed in, and what they may do.
 *
 * Sessions live in the database, not in a signed cookie: the cookie holds a random
 * token, the table holds its hash. That costs one query per request, and buys what
 * matters here: removing an account or changing its role takes effect at once,
 * with no secret to configure.
 *
 * Every page and every server action asks this itself. Hiding a button is a
 * courtesy; anyone can post to an action directly.
 */

const COOKIE = "session";
const SESSION_DAYS = 30;

export interface Session {
  accountId: string;
  role: AccountRole;
  /** Set for an athlete's account; null for a staff login. */
  athleteId: string | null;
  /** The athlete's name, or the staff login's ("Admin"). Recorded on every change. */
  displayName: string;
}

export const NOT_SIGNED_IN = "Sign in to do that.";
export const NOT_ALLOWED = "Your account can't do that.";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The signed-in account, or null. Cached per request, so pages and components can each ask. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  // Between a deploy and its migration the tables aren't there yet: nobody is signed
  // in for those few minutes, rather than every page failing.
  const [row] = await db
    .select({
      accountId: accounts.id,
      role: accounts.role,
      athleteId: accounts.athleteId,
      staffName: accounts.staffName,
      athleteName: athletes.name,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .leftJoin(athletes, eq(athletes.id, accounts.athleteId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
    .catch((error) => {
      if (isMigrationPending(error)) return [];
      throw error;
    });
  if (!row) return null;

  return {
    accountId: row.accountId,
    role: row.role,
    athleteId: row.athleteId,
    displayName: row.athleteName ?? row.staffName ?? "unknown",
  };
});

/** The session, if it holds one of `roles`. Admin passes every check. */
export async function authorize(...roles: AccountRole[]): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  return session.role === "admin" || roles.includes(session.role) ? session : null;
}

/** Why `authorize` said no, in words for the person. */
export async function refusal(): Promise<string> {
  return (await getSession()) ? NOT_ALLOWED : NOT_SIGNED_IN;
}

export const canScore = (session: Session | null): session is Session =>
  session?.role === "scorekeeper" || session?.role === "admin";
/** An athlete or the admin: who the Athletes pages are for. Scorekeepers are not members. */
export const isMember = (session: Session | null): session is Session =>
  session?.role === "athlete" || session?.role === "admin";
export const isAdmin = (session: Session | null): session is Session => session?.role === "admin";

/** An athlete edits their own profile and walkout song; the admin edits anyone's. */
export function canEditAthlete(session: Session | null, athleteId: string): boolean {
  if (!session) return false;
  return session.role === "admin" || (session.athleteId !== null && session.athleteId === athleteId);
}

export async function createSession(accountId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  // Tidy up while here: nothing else reads expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({ id: hashToken(token), accountId, expiresAt });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Local dev is plain http; a Secure cookie would never be sent back.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(COOKIE);
}
