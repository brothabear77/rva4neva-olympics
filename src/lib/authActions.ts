"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withActor } from "./db";
import { accounts, athleteProfiles, athletes, results, vlogVideos } from "./schema";
import { SUBMISSIONS_LOCKED_MESSAGE, submissionsLocked } from "./flags";
import { deleteStored, vlogMediaConfigured } from "./vlogMedia";
import { authorize, canEditAthlete, createSession, destroyOtherSessions, destroySession, getSession, refusal } from "./auth";
import { checkPassword, checkUsername, defaultUsername } from "./credentials";
import { hashPassword, verifyPassword } from "./password";
import { MAX_BIO_LENGTH, MAX_TAGLINE_LENGTH } from "./profiles";
import { checkAthleteName } from "./roster";
import { createAthlete } from "./athleteAccounts";
import { syncOpenProposals } from "./proposalClock";
import { REGISTRATION_LOCKED_MESSAGE, registrationLocked, setRegistrationLockedValue } from "./siteSettings";
import type { ActionResult } from "./actions";
import { isUniqueViolation, userMessage } from "./dbErrors";

/**
 * Accounts: signing up as an athlete, signing in and out, and the admin's side of it.
 *
 * Signing up creates the account straight away, with no approval.
 */

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

/** Wrong passwords in a row before the account waits a minute. */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 60_000;

function revalidateAccounts() {
  for (const path of ["/admin", "/login", "/register", "/info/athletes", "/athletes/vote"]) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Signing up as an athlete
// ---------------------------------------------------------------------------

/**
 * Sign up as a new athlete: a name, a username and a password. In one transaction it adds
 * them to the roster (so they're in every event, the leaderboard and the votes at once),
 * creates their account, and signs them in. No approval; the admin's control is the
 * registration lock. Existing athletes get their accounts from `npm run auth:athletes`.
 */
export async function signUp(input: {
  name: string;
  username: string;
  password: string;
  confirm: string;
}): Promise<ActionResult> {
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

    await createSession(created.accountId);
    for (const path of NAME_PATHS) revalidatePath(path);
    revalidateAccounts();
    return ok(`Welcome, ${created.name}! You're signed in.`);
  } catch (error) {
    // Two people racing for the same name or username: the unique indexes decide.
    if (isUniqueViolation(error)) return fail("Someone just took that name or username. Try another.");
    return fail(userMessage(error, "Something went wrong. Try again."));
  }
}

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------

/** Said for an unknown username and a wrong password alike, so it doesn't reveal which usernames exist. */
const BAD_LOGIN = "Wrong username or password.";

export async function signIn(input: { username: string; password: string }): Promise<ActionResult> {
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
  await createSession(account.id);
  return ok("Signed in.");
}

export async function signOut(): Promise<ActionResult> {
  await destroySession();
  return ok("Signed out.");
}

// ---------------------------------------------------------------------------
// Your own sign-in details
// ---------------------------------------------------------------------------

/** Change the signed-in account's own username. */
export async function changeUsername(input: { username: string }): Promise<ActionResult<{ username: string }>> {
  const session = await getSession();
  if (!session) return fail(await refusal());
  const username = checkUsername(String(input?.username ?? ""));
  if (!username.ok) return fail(username.error);

  try {
    const updated = await db
      .update(accounts)
      .set({ username: username.value })
      .where(eq(accounts.id, session.accountId))
      .returning({ id: accounts.id });
    if (!updated.length) return fail("Your account no longer exists.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Someone already has that username.");
    return fail("Something went wrong. Nothing was saved.");
  }

  revalidatePath("/profile");
  revalidatePath("/admin");
  return ok(`Your username is now ${username.value}.`, { username: username.value });
}

/**
 * Change the signed-in account's own password. Needs the current one, so a borrowed
 * phone can't lock the owner out, and signs out every other browser.
 */
export async function changePassword(input: { current: string; password: string; confirm: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail(await refusal());
  const parsed = z.object({ current: z.string().max(400), password: z.string(), confirm: z.string() }).safeParse(input);
  if (!parsed.success) return fail("Check the form and try again.");

  const next = checkPassword(parsed.data.password, parsed.data.confirm);
  if (!next.ok) return fail(next.error);

  const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  if (!account) return fail("Your account no longer exists.");
  if (!(await verifyPassword(parsed.data.current, account.passwordHash))) return fail("Your current password is wrong.");
  if (parsed.data.current === next.value) return fail("That's already your password.");

  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(next.value), failedLogins: 0, lockedUntil: null })
    .where(eq(accounts.id, account.id));
  await destroyOtherSessions(account.id);
  return ok("Password changed. Any other browsers were signed out.");
}

// ---------------------------------------------------------------------------
// The admin's side
// ---------------------------------------------------------------------------

/**
 * Delete an athlete entirely: an account and its athlete are one thing, so this takes
 * their login, sign-ins, profile, walkout song, scores, practice log, votes, proposals
 * and Vlog videos (the files too). Staff logins are managed with `npm run auth:staff`.
 *
 * It's recorded in Change History, with every entry marked unrecoverable: the account
 * and the rest can't come back, so the athlete and their scores can't either. Refused
 * while the scoreboard is locked, since it deletes scores.
 */
export async function deleteAthlete(athleteId: string): Promise<ActionResult> {
  const session = await authorize("admin");
  if (!session) return fail(await refusal());
  if (!z.string().uuid().safeParse(athleteId).success) return fail("Missing athlete.");
  if (await submissionsLocked()) return fail(SUBMISSIONS_LOCKED_MESSAGE);

  try {
    const removed = await withActor({ actor: session.displayName, unrecoverable: true }, async (tx) => {
      const [{ scores }] = await tx
        .select({ scores: sql<number>`count(*)::int` })
        .from(results)
        .where(eq(results.athleteId, athleteId));
      const videos = await tx.select({ key: vlogVideos.objectKey }).from(vlogVideos).where(eq(vlogVideos.athleteId, athleteId));

      // Everything else hangs off the athlete with ON DELETE CASCADE, the account included.
      const [athlete] = await tx.delete(athletes).where(eq(athletes.id, athleteId)).returning();
      if (!athlete) throw new Error("That athlete was already deleted.");
      // One fewer athlete to wait for may mean everyone left has voted.
      await syncOpenProposals(tx);
      return { name: athlete.name, scores, keys: videos.map((v) => v.key) };
    });

    // Only once the rows are gone for good; a failure here just leaves a stray file.
    if (vlogMediaConfigured()) {
      for (const key of removed.keys) {
        await deleteStored(key).catch((error) => console.warn(`Could not delete Vlog object "${key}": ${(error as Error).message}`));
      }
    }

    for (const path of [...NAME_PATHS, "/athletes/vlog"]) revalidatePath(path);
    revalidateAccounts();
    const scores = removed.scores ? ` and their ${removed.scores} score${removed.scores === 1 ? "" : "s"}` : "";
    return ok(`Deleted ${removed.name}${scores}.`);
  } catch (error) {
    return fail(userMessage(error, "Something went wrong. Nothing was deleted."));
  }
}

/** Close registration to new sign-ups, or open it again. */
export async function setRegistrationLocked(locked: boolean): Promise<ActionResult> {
  if (!(await authorize("admin"))) return fail(await refusal());
  if (typeof locked !== "boolean") return fail("Check the request and try again.");

  await setRegistrationLockedValue(locked);
  revalidateAccounts();
  return ok(locked ? "Registration is locked. Nobody can sign up." : "Registration is open.");
}

/** Let an athlete's account enter scores too, or take that away. */
export async function setScorekeeper(input: { accountId: string; on: boolean }): Promise<ActionResult> {
  if (!(await authorize("admin"))) return fail(await refusal());
  const parsed = z.object({ accountId: z.string().uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Missing account.");

  const updated = await db
    .update(accounts)
    .set({ role: parsed.data.on ? "scorekeeper" : "athlete" })
    .where(and(eq(accounts.id, parsed.data.accountId), sql`${accounts.athleteId} is not null`))
    .returning();
  revalidatePath("/admin");
  return updated.length
    ? ok(parsed.data.on ? "They can now enter scores." : "They can no longer enter scores.")
    : fail("That account can't be changed here.");
}

// ---------------------------------------------------------------------------
// An athlete's own profile
// ---------------------------------------------------------------------------

export async function updateProfile(input: { athleteId: string; tagline: string; bio: string }): Promise<ActionResult> {
  const parsed = z
    .object({
      athleteId: z.string().uuid(),
      tagline: z.string().trim().max(MAX_TAGLINE_LENGTH, "That tagline is too long."),
      bio: z.string().trim().max(MAX_BIO_LENGTH, "That bio is too long."),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the profile and try again.");

  const { athleteId, tagline, bio } = parsed.data;
  if (!canEditAthlete(await getSession(), athleteId)) return fail(await refusal());

  const [athlete] = await db.select().from(athletes).where(eq(athletes.id, athleteId)).limit(1);
  if (!athlete) return fail("That athlete is no longer on the roster.");

  // The photo isn't touched: photos can't be edited here yet.
  await db
    .insert(athleteProfiles)
    .values({ athleteId, tagline, bio })
    .onConflictDoUpdate({ target: athleteProfiles.athleteId, set: { tagline, bio, updatedAt: sql`now()` } });

  revalidatePath("/info/athletes");
  revalidatePath("/profile");
  return ok("Profile saved.");
}

/** Everywhere a name is shown: a rename touches the whole site. */
const NAME_PATHS = ["/", "/leaderboard", "/events", "/submit", "/changelog", "/info/athletes", "/profile", "/athletes/progress", "/athletes/vote"];

/**
 * Change an athlete's name: your own, or anyone's for the admin. The athlete's scores,
 * account, walkout song and votes follow along, since they hang off the id. Not logged
 * in Change History: only the athlete or the admin can do it, so there's nothing to audit.
 */
export async function renameAthlete(input: { athleteId: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ athleteId: z.string().uuid(), name: z.string() }).safeParse(input);
  if (!parsed.success) return fail("Check the name and try again.");

  const session = await getSession();
  if (!canEditAthlete(session, parsed.data.athleteId)) return fail(await refusal());

  try {
    const message = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(athletes).where(eq(athletes.id, parsed.data.athleteId)).limit(1);
      if (!current) throw new Error("That athlete is no longer on the roster.");

      // The athlete's own id is excluded so they don't clash with themselves, which is
      // also what lets a rename change only the capitalisation.
      const roster = await tx.select({ id: athletes.id, name: athletes.name }).from(athletes);
      const check = checkAthleteName(parsed.data.name, roster, current.id);
      if (!check.ok) throw new Error(check.error);
      if (check.name === current.name) throw new Error("That is already the name.");

      await tx.update(athletes).set({ name: check.name }).where(eq(athletes.id, current.id));
      return `Renamed ${current.name} to ${check.name}.`;
    });

    for (const path of NAME_PATHS) revalidatePath(path);
    return ok(message);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Someone with that name is already on the roster.");
    return fail(userMessage(error, "Something went wrong. Nothing was saved."));
  }
}
