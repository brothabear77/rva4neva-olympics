import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Tx } from "./db";
import { accounts, proposalVotes, proposals } from "./schema";
import { closesAtAfterVote } from "./votes";

/**
 * Keeps each open proposal's close time in step with who has voted (see
 * `closesAtAfterVote`). Not in athleteActions.ts: everything exported from a "use server"
 * file is callable from the browser, and this is for other server code to call.
 *
 * Run it after anything that changes the votes or who is eligible to cast one: a vote or
 * a cleared vote, an account approved, an account removed.
 */

/** Recompute one proposal's close time. The caller holds the proposal's row lock. */
export async function syncCloseTime(tx: Tx, proposal: typeof proposals.$inferSelect): Promise<void> {
  const [{ eligible }] = await tx
    .select({ eligible: sql<number>`count(*)::int` })
    .from(accounts)
    .where(sql`${accounts.athleteId} is not null`);
  // Only votes from athletes who still have an account: removing one leaves its votes behind.
  const [{ voted }] = await tx
    .select({ voted: sql<number>`count(*)::int` })
    .from(proposalVotes)
    .innerJoin(accounts, eq(accounts.athleteId, proposalVotes.athleteId))
    .where(eq(proposalVotes.proposalId, proposal.id));

  const closesAt = closesAtAfterVote({
    createdAt: proposal.createdAt,
    now: new Date(),
    allVoted: eligible > 0 && voted >= eligible,
  });
  if (closesAt.getTime() !== proposal.closesAt.getTime()) {
    await tx.update(proposals).set({ closesAt }).where(eq(proposals.id, proposal.id));
  }
}

/** Recompute every proposal still open, for when the athletes (not the votes) changed. */
export async function syncOpenProposals(tx: Tx): Promise<void> {
  const open = await tx
    .select()
    .from(proposals)
    .where(and(isNull(proposals.withdrawnAt), gt(proposals.closesAt, sql`now()`)))
    .for("update");
  for (const proposal of open) await syncCloseTime(tx, proposal);
}
