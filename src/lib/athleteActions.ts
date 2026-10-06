"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "./db";
import { getSession, isAdmin, refusal, type Session } from "./auth";
import { athletes, events, practiceAttempts, proposalVotes, proposals } from "./schema";
import { syncCloseTime } from "./proposalClock";
import { MAX_RAW_VALUE } from "./grid";
import { todayInEventZone } from "./time";
import { MAX_OPEN_PROPOSALS, MAX_PROPOSAL_BODY_LENGTH, MAX_TITLE_LENGTH, closesAtFor, decideProposal } from "./votes";
import type { ActionResult } from "./actions";

/**
 * The athletes' pages: practice attempts and group proposals. Like every action, each
 * checks the signed-in account itself. These tables are not audited.
 */

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

const MAX_NOTES_LENGTH = 300;

/** The session, if it belongs to an athlete (the admin has no athlete of its own). */
async function athleteSession(): Promise<(Session & { athleteId: string }) | null> {
  const session = await getSession();
  return session?.athleteId ? (session as Session & { athleteId: string }) : null;
}

// ---------------------------------------------------------------------------
// Practice attempts
// ---------------------------------------------------------------------------

export async function logAttempt(input: {
  eventId: string;
  value: number;
  attemptedOn: string;
  notes: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      value: z.number().finite().gt(-MAX_RAW_VALUE).lt(MAX_RAW_VALUE),
      attemptedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().trim().max(MAX_NOTES_LENGTH, "Those notes are too long."),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the attempt and try again.");

  const session = await athleteSession();
  if (!session) return fail(await refusal());

  const { eventId, value, attemptedOn, notes } = parsed.data;
  if (attemptedOn > todayInEventZone()) return fail("That date hasn't happened yet.");
  if (Number.isNaN(Date.parse(attemptedOn))) return fail("That isn't a real date.");

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.isActive, true)))
    .limit(1);
  if (!event) return fail("That event isn't available. Reload the page.");

  await db.insert(practiceAttempts).values({ athleteId: session.athleteId, eventId, rawValue: value, attemptedOn, notes });
  revalidatePath("/athletes/progress");
  return ok("Attempt logged.");
}

export async function deleteAttempt(attemptId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(attemptId).success) return fail("That attempt no longer exists.");
  const session = await getSession();
  if (!session) return fail(await refusal());

  const own = session.athleteId ? eq(practiceAttempts.athleteId, session.athleteId) : sql`false`;
  const deleted = await db
    .delete(practiceAttempts)
    .where(and(eq(practiceAttempts.id, attemptId), isAdmin(session) ? undefined : own))
    .returning({ id: practiceAttempts.id });
  if (deleted.length === 0) return fail("That attempt no longer exists.");

  revalidatePath("/athletes/progress");
  return ok("Attempt deleted.");
}

// ---------------------------------------------------------------------------
// Proposals and votes
// ---------------------------------------------------------------------------

export async function createProposal(input: { title: string; body: string }): Promise<ActionResult> {
  const parsed = z
    .object({
      title: z.string().trim().min(3, "Give the proposal a title.").max(MAX_TITLE_LENGTH, "That title is too long."),
      body: z.string().trim().max(MAX_PROPOSAL_BODY_LENGTH, "That description is too long."),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the proposal and try again.");

  const session = await athleteSession();
  if (!session) return fail(await refusal());

  const full = await db.transaction(async (tx) => {
    // Lock the athlete's row so two proposals posted at once can't both squeeze under the limit.
    await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, session.athleteId)).for("update");
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(proposals)
      .where(and(eq(proposals.athleteId, session.athleteId), sql`${proposals.withdrawnAt} is null and ${proposals.closesAt} > now()`));
    if (open >= MAX_OPEN_PROPOSALS) return true;

    await tx.insert(proposals).values({
      athleteId: session.athleteId,
      title: parsed.data.title,
      body: parsed.data.body,
      closesAt: closesAtFor(new Date()),
    });
    return false;
  });
  if (full) {
    return fail(`You already have ${MAX_OPEN_PROPOSALS} proposals open. Withdraw one, or wait for one to close, to post another.`);
  }
  revalidatePath("/athletes/vote");
  return ok("Proposal posted. Voting is open for a week.");
}

/**
 * The proposal, locked for the rest of the transaction so two votes landing together
 * can't each decide on a stale turnout; or why there isn't one to vote on.
 */
async function lockOpenProposal(tx: Tx, proposalId: string): Promise<typeof proposals.$inferSelect | "gone" | "closed"> {
  const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1).for("update");
  if (!proposal) return "gone";
  const open = decideProposal({ yes: 0, no: 0, eligible: 1, closesAt: proposal.closesAt, withdrawnAt: proposal.withdrawnAt }) === "open";
  return open ? proposal : "closed";
}

export async function castVote(input: { proposalId: string; inFavor: boolean }): Promise<ActionResult> {
  const parsed = z.object({ proposalId: z.string().uuid(), inFavor: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("That proposal no longer exists.");

  const session = await athleteSession();
  if (!session) return fail(await refusal());

  const closed = await db.transaction(async (tx) => {
    const proposal = await lockOpenProposal(tx, parsed.data.proposalId);
    if (proposal === "gone") return "That proposal no longer exists.";
    if (proposal === "closed") return "Voting on that proposal has closed.";

    await tx
      .insert(proposalVotes)
      .values({ proposalId: proposal.id, athleteId: session.athleteId, inFavor: parsed.data.inFavor })
      .onConflictDoUpdate({
        target: [proposalVotes.proposalId, proposalVotes.athleteId],
        set: { inFavor: parsed.data.inFavor, updatedAt: sql`now()` },
      });
    await syncCloseTime(tx, proposal);
    return null;
  });
  if (closed) return fail(closed);
  revalidatePath("/athletes/vote");
  return ok("Vote recorded.");
}

/** Takes back your vote on an open proposal, so it counts as if you hadn't voted. */
export async function clearVote(proposalId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(proposalId).success) return fail("That proposal no longer exists.");
  const session = await athleteSession();
  if (!session) return fail(await refusal());

  const closed = await db.transaction(async (tx) => {
    const proposal = await lockOpenProposal(tx, proposalId);
    if (proposal === "gone") return "That proposal no longer exists.";
    if (proposal === "closed") return "Voting on that proposal has closed.";

    await tx
      .delete(proposalVotes)
      .where(and(eq(proposalVotes.proposalId, proposal.id), eq(proposalVotes.athleteId, session.athleteId)));
    await syncCloseTime(tx, proposal);
    return null;
  });
  if (closed) return fail(closed);
  revalidatePath("/athletes/vote");
  return ok("Vote cleared.");
}

/** The proposer withdraws their own open proposal. */
export async function withdrawProposal(proposalId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(proposalId).success) return fail("That proposal no longer exists.");
  const session = await athleteSession();
  if (!session) return fail(await refusal());

  const withdrawn = await db
    .update(proposals)
    .set({ withdrawnAt: sql`now()` })
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.athleteId, session.athleteId),
        sql`${proposals.withdrawnAt} is null and ${proposals.closesAt} > now()`,
      ),
    )
    .returning({ id: proposals.id });
  if (withdrawn.length === 0) return fail("That proposal can't be withdrawn.");

  revalidatePath("/athletes/vote");
  return ok("Proposal withdrawn.");
}

/** The admin's moderation: removes a proposal and its votes entirely. */
export async function removeProposal(proposalId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(proposalId).success) return fail("That proposal no longer exists.");
  const session = await getSession();
  if (!isAdmin(session)) return fail(await refusal());

  await db.delete(proposals).where(eq(proposals.id, proposalId));
  revalidatePath("/athletes/vote");
  return ok("Proposal removed.");
}
