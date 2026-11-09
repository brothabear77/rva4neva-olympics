"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withActor } from "./db";
import { accounts, athleteProfiles, athletes, claimRequests } from "./schema";
import { authorize, canEditAthlete, createSession, destroySession, getSession, refusal } from "./auth";
import { checkPassword, normalizePhone } from "./credentials";
import { hashPassword, verifyPassword } from "./password";
import { ATHLETE_PROFILES } from "@/content/athletes";
import { MAX_BIO_LENGTH, MAX_TAGLINE_LENGTH, mergeAthleteProfiles, type AthleteProfile } from "./profiles";
import { checkAthleteName } from "./roster";
import { syncOpenProposals } from "./proposalClock";
import type { ActionResult } from "./actions";

/**
 * Accounts: claiming an athlete, signing in and out, and the admin's side of it.
 *
 * A claim is a request, not an account. It sits in app.claim_requests with the phone
 * number the admin uses to tell who is asking, and only becomes an account when the
 * admin approves it. Either way the request row, phone and all, is then deleted.
 */

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

/** More than this many claims waiting on one athlete is someone trying their luck. */
const MAX_PENDING_PER_ATHLETE = 3;
/** Wrong passwords in a row before the account waits a minute. */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 60_000;

function revalidateAccounts() {
  for (const path of ["/admin", "/login", "/claim", "/info/athletes", "/athletes/vote"]) revalidatePath(path);
}

/** What src/content/athletes.ts says about this athlete, if anything. */
function fileProfileFor(athlete: { name: string }): AthleteProfile | null {
  return mergeAthleteProfiles([athlete], ATHLETE_PROFILES).rows[0]?.profile ?? null;
}

// ---------------------------------------------------------------------------
// Claiming an athlete
// ---------------------------------------------------------------------------

export async function requestClaim(input: {
  athleteId: string;
  phone: string;
  password: string;
  confirm: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ athleteId: z.string().uuid(), phone: z.string(), password: z.string(), confirm: z.string() })
    .safeParse(input);
  if (!parsed.success) return fail("Pick your name from the list.");

  const phone = normalizePhone(parsed.data.phone);
  if (!phone.ok) return fail(phone.error);
  const password = checkPassword(parsed.data.password, parsed.data.confirm);
  if (!password.ok) return fail(password.error);

  const passwordHash = await hashPassword(password.value);

  try {
    const name = await db.transaction(async (tx) => {
      const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, parsed.data.athleteId)).limit(1);
      if (!athlete) throw new Error("That athlete is no longer on the roster. Reload the page.");

      const [taken] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.athleteId, athlete.id)).limit(1);
      if (taken) throw new Error(`${athlete.name} has already been claimed.`);

      const [{ pending }] = await tx
        .select({ pending: count() })
        .from(claimRequests)
        .where(eq(claimRequests.athleteId, athlete.id));
      if (pending >= MAX_PENDING_PER_ATHLETE) {
        throw new Error(`${athlete.name} already has claims waiting for the admin. Ask them to sort it out.`);
      }

      await tx.insert(claimRequests).values({ athleteId: athlete.id, phone: phone.value, passwordHash });
      return athlete.name;
    });

    revalidatePath("/admin");
    return ok(`Thanks! Your claim on ${name} is waiting for the admin. Once it's approved, sign in with your password.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------

export async function signIn(input: { accountId: string; password: string }): Promise<ActionResult> {
  const parsed = z.object({ accountId: z.string().uuid(), password: z.string().max(400) }).safeParse(input);
  if (!parsed.success) return fail("Pick your name from the list.");

  const [account] = await db.select().from(accounts).where(eq(accounts.id, parsed.data.accountId)).limit(1);
  if (!account) return fail("That account no longer exists. Reload the page.");

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
    return fail(lock ? "Too many wrong passwords. Wait a minute and try again." : "Wrong password.");
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
// The admin's side
// ---------------------------------------------------------------------------

/**
 * Turn a claim into an account. In the same transaction, the athlete's profile moves
 * from src/content/athletes.ts into the database (unless it's already there), and
 * every claim on them is deleted, phone numbers included.
 */
export async function approveClaim(claimId: string): Promise<ActionResult> {
  if (!(await authorize("admin"))) return fail(await refusal());
  if (!z.string().uuid().safeParse(claimId).success) return fail("Missing claim.");

  try {
    const name = await db.transaction(async (tx) => {
      const [claim] = await tx.select().from(claimRequests).where(eq(claimRequests.id, claimId)).limit(1);
      if (!claim) throw new Error("That claim was already handled.");

      const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, claim.athleteId)).limit(1);
      if (!athlete) throw new Error("That athlete is no longer on the roster.");

      await tx.insert(accounts).values({ role: "athlete", athleteId: athlete.id, passwordHash: claim.passwordHash });

      const fileProfile = fileProfileFor(athlete);
      await tx
        .insert(athleteProfiles)
        .values({
          athleteId: athlete.id,
          tagline: fileProfile?.tagline?.trim() ?? "",
          bio: fileProfile?.bio?.trim() ?? "",
          photo: fileProfile?.photo?.trim() ?? "",
        })
        .onConflictDoNothing();

      await tx.delete(claimRequests).where(eq(claimRequests.athleteId, athlete.id));
      // A new athlete who hasn't voted means no proposal has full turnout any more.
      await syncOpenProposals(tx);
      return athlete.name;
    });

    revalidateAccounts();
    return ok(`${name}'s account is approved. Their profile now lives in the database.`);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return fail("That athlete already has an account.");
    return fail(error instanceof Error ? error.message : "Something went wrong.");
  }
}

export async function rejectClaim(claimId: string): Promise<ActionResult> {
  if (!(await authorize("admin"))) return fail(await refusal());
  if (!z.string().uuid().safeParse(claimId).success) return fail("Missing claim.");

  const removed = await db.delete(claimRequests).where(eq(claimRequests.id, claimId)).returning();
  revalidatePath("/admin");
  return removed.length ? ok("Claim rejected and deleted.") : fail("That claim was already handled.");
}

/**
 * Delete an athlete's account, so they (or the right person) can claim it again.
 * Their profile stays: it belongs to the athlete, not the login. Staff logins are
 * managed with `npm run auth:staff`, not from here.
 */
export async function removeAccount(accountId: string): Promise<ActionResult> {
  if (!(await authorize("admin"))) return fail(await refusal());
  if (!z.string().uuid().safeParse(accountId).success) return fail("Missing account.");

  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(accounts)
      .where(and(eq(accounts.id, accountId), sql`${accounts.staffName} is null`))
      .returning();
    // One fewer athlete to wait for may mean everyone left has voted.
    if (rows.length) await syncOpenProposals(tx);
    return rows;
  });
  revalidateAccounts();
  return removed.length ? ok("Account removed. The athlete can be claimed again.") : fail("That account can't be removed here.");
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

  // A first save carries the photo over from the content file, since photos can't be
  // edited here yet and the database row replaces the file's entry entirely.
  const photo = fileProfileFor(athlete)?.photo?.trim() ?? "";
  await db
    .insert(athleteProfiles)
    .values({ athleteId, tagline, bio, photo })
    .onConflictDoUpdate({ target: athleteProfiles.athleteId, set: { tagline, bio, updatedAt: sql`now()` } });

  revalidatePath("/info/athletes");
  revalidatePath("/profile");
  return ok("Profile saved.");
}

/** Everywhere a name is shown: a rename touches the whole site. */
const NAME_PATHS = ["/", "/leaderboard", "/events", "/submit", "/changelog", "/info/athletes", "/profile", "/athletes/progress", "/athletes/vote"];

/**
 * Change an athlete's name: your own, or anyone's for the admin. The athlete's scores,
 * account, walkout song and votes follow along, since they hang off the id, and the
 * change lands in Change History (where it can be undone) like any other to `athletes`.
 *
 * One thing hangs off the name: a bio or photo still written in src/content/athletes.ts
 * is matched by it. So if the athlete has no profile in the database yet, the file's
 * entry is copied there in the same transaction, and renaming never loses it.
 */
export async function renameAthlete(input: { athleteId: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ athleteId: z.string().uuid(), name: z.string() }).safeParse(input);
  if (!parsed.success) return fail("Check the name and try again.");

  const session = await getSession();
  if (!canEditAthlete(session, parsed.data.athleteId)) return fail(await refusal());

  try {
    const message = await withActor({ actor: session!.displayName }, async (tx) => {
      const [current] = await tx.select().from(athletes).where(eq(athletes.id, parsed.data.athleteId)).limit(1);
      if (!current) throw new Error("That athlete is no longer on the roster.");

      // The athlete's own id is excluded so they don't clash with themselves, which is
      // also what lets a rename change only the capitalisation.
      const roster = await tx.select({ id: athletes.id, name: athletes.name }).from(athletes);
      const check = checkAthleteName(parsed.data.name, roster, current.id);
      if (!check.ok) throw new Error(check.error);
      if (check.name === current.name) throw new Error("That is already the name.");

      const [stored] = await tx
        .select({ athleteId: athleteProfiles.athleteId })
        .from(athleteProfiles)
        .where(eq(athleteProfiles.athleteId, current.id))
        .limit(1);
      const fromFile = stored ? null : fileProfileFor(current);
      if (fromFile) {
        await tx.insert(athleteProfiles).values({
          athleteId: current.id,
          tagline: fromFile.tagline?.trim() ?? "",
          bio: fromFile.bio?.trim() ?? "",
          photo: fromFile.photo?.trim() ?? "",
        });
      }

      await tx.update(athletes).set({ name: check.name }).where(eq(athletes.id, current.id));
      return `Renamed ${current.name} to ${check.name}.`;
    });

    for (const path of NAME_PATHS) revalidatePath(path);
    return ok(message);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return fail("Someone with that name is already on the roster.");
    return fail(error instanceof Error ? error.message : "Something went wrong. Nothing was saved.");
  }
}
