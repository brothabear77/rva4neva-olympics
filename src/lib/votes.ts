/**
 * How a group proposal is decided.
 *
 * A proposal is open for a week. When the week ends it passes only if at least half
 * of all athletes voted and more voted Yes than No; a tie fails.
 */

export const VOTING_DAYS = 7;
/** How many proposals one athlete can have open for voting at the same time. */
export const MAX_OPEN_PROPOSALS = 3;
export const MAX_TITLE_LENGTH = 120;
export const MAX_PROPOSAL_BODY_LENGTH = 2000;

/** Once every athlete has voted there is nothing left to wait for: it closes this soon after. */
export const FULL_TURNOUT_SECONDS = 60;

export type ProposalStatus = "open" | "withdrawn" | "passed" | "no-quorum" | "rejected";

/** Votes needed for the result to count: half of the eligible athletes, rounded up. */
export function quorumFor(eligible: number): number {
  return Math.ceil(eligible / 2);
}

export function closesAtFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + VOTING_DAYS * 24 * 60 * 60 * 1000);
}

export function decideProposal(p: {
  yes: number;
  no: number;
  eligible: number;
  closesAt: Date;
  withdrawnAt: Date | null;
  now?: Date;
}): ProposalStatus {
  if (p.withdrawnAt) return "withdrawn";
  if ((p.now ?? new Date()).getTime() < p.closesAt.getTime()) return "open";
  if (p.yes + p.no < quorumFor(p.eligible)) return "no-quorum";
  return p.yes > p.no ? "passed" : "rejected";
}

/**
 * When a proposal closes, given who has voted. Normally a week after it was posted. Once
 * every athlete has voted it closes 60 seconds after the latest vote, though never later
 * than the week. If someone then takes their vote back (or a new athlete joins and has
 * not voted), it goes back to the week. It is always worked out from the original close,
 * so it needs nothing stored beyond `createdAt`.
 */
export function closesAtAfterVote(p: { createdAt: Date; now: Date; allVoted: boolean }): Date {
  const original = closesAtFor(p.createdAt);
  if (!p.allVoted) return original;
  const soon = new Date(p.now.getTime() + FULL_TURNOUT_SECONDS * 1000);
  return soon < original ? soon : original;
}
