import "server-only";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { accounts, athletes } from "./schema";
import { checkPassword, checkUsername } from "./credentials";
import { hashPassword, verifyPassword } from "./password";
import { checkAthleteName } from "./roster";
import { createAthlete } from "./athleteAccounts";
import { syncOpenProposals } from "./proposalClock";
import { REGISTRATION_LOCKED_MESSAGE, registrationLocked } from "./siteSettings";
import type { ActionResult } from "./actions";
import { isUniqueViolation, userMessage } from "./dbErrors";

/**
 * Signing up and checking a password, without deciding how the session is carried.
 *
 * The website's server actions (authActions.ts) follow these with a cookie; the iOS
 * API (src/app/api/v1/auth) follows them with a bearer token. Not a "use server"
 * file, so nothing here can be called from a browser directly.
 */

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

/** Wrong passwords in a row before the account waits a minute. */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 60_000;

/** Everywhere a name is shown: a rename touches the whole site. */
export const NAME_PATHS = ["/", "/leaderboard", "/events", "/submit", "/changelog", "/info/athletes", "/profile", "/athletes/progress", "/athletes/vote"];

export function revalidateAccounts() {
  for (const path of ["/admin", "/login", "/register", "/info/athletes", "/athletes/vote"]) revalidatePath(path);
}

/**
 * Add a new athlete and their account: a name, a username and a password. In one
 * transaction it adds them to the roster (so they're in every event, the leaderboard and
 * the votes at once) and creates their account. No approval; the admin's control is the
 * registration lock. Does not sign them in: the caller does, by cookie or by token.
 */
export async function registerAthlete(input: {
  name: string;
  username: string;
  password: string;
  confirm: string;
}): Promise<ActionResult<{ accountId: string; name: string }>> {
  const parsed = z
    .object({ name: z.string().max(400), username: z.string().max(100), password: z.string(), confirm: z.string() })
    .safeParse(input);
  if (!parsed.success) return fail("Check the form and try again.");
  if (await registrationLocked()) return fail(REGISTRATION_LOCKED_MESSAGE);

  const username = checkUsername(parsed.data.username);
  if (!username.ok) return fail(username.error);
  const password = checkPassword(parsed.data.password, parsed.data.confirm);
  if (!password.ok) return fail(password.error);

  const passwordHash = await hashPassword(password.value);

  try {
    // Sign-ups aren't in Change History, so a plain transaction.
    const created = await db.transaction(async (tx) => {
      const roster = await tx.select({ id: athletes.id, name: athletes.name }).from(athletes);
      const name = checkAthleteName(parsed.data.name, roster);
      if (!name.ok) throw new Error(name.error);

      const [same] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(sql`lower(${accounts.username}) = ${username.value}`)
        .limit(1);
      if (same) throw new Error("Someone already has that username.");

      const athlete = await createAthlete(tx, { name: name.name, username: username.value, passwordHash });
      // A new athlete who hasn't voted means no proposal has full turnout any more.
      await syncOpenProposals(tx);
      return athlete;
    });

    for (const path of NAME_PATHS) revalidatePath(path);
    revalidateAccounts();
    return ok(`Welcome, ${created.name}! You're signed in.`, { accountId: created.accountId, name: created.name });
  } catch (error) {
    // Two people racing for the same name or username: the unique indexes decide.
    if (isUniqueViolation(error)) return fail("Someone just took that name or username. Try another.");
    return fail(userMessage(error, "Something went wrong. Try again."));
  }
}

/** Said for an unknown username and a wrong password alike, so it doesn't reveal which usernames exist. */
const BAD_LOGIN = "Wrong username or password.";

/**
 * Check a username and password, with the lockout after repeated wrong passwords.
 * Returns the account to sign in; starting the session is the caller's job.
 */
export async function checkLogin(input: { username: string; password: string }): Promise<ActionResult<{ accountId: string }>> {
  const parsed = z.object({ username: z.string().max(100), password: z.string().max(400) }).safeParse(input);
  if (!parsed.success) return fail(BAD_LOGIN);

  const username = parsed.data.username.trim().toLowerCase();
  const [account] = await db.select().from(accounts).where(sql`lower(${accounts.username}) = ${username}`).limit(1);
  if (!account) {
    // Still spend the time hashing, so a missing username isn't visibly faster than a wrong password.
    await verifyPassword(parsed.data.password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AA==");
    return fail(BAD_LOGIN);
  }

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    return fail("Too many wrong passwords. Wait a minute and try again.");
  }

  if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
    const failures = account.failedLogins + 1;
    const lock = failures >= MAX_FAILED_LOGINS;
    await db
      .update(accounts)
      .set({ failedLogins: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MS) : null })
      .where(eq(accounts.id, account.id));
    return fail(lock ? "Too many wrong passwords. Wait a minute and try again." : BAD_LOGIN);
  }

  if (account.failedLogins > 0 || account.lockedUntil) {
    await db.update(accounts).set({ failedLogins: 0, lockedUntil: null }).where(eq(accounts.id, account.id));
  }
  return ok("Signed in.", { accountId: account.id });
}
