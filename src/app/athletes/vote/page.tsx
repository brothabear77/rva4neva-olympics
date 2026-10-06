import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ProposalActions } from "@/components/ProposalActions";
import { ProposalForm } from "@/components/ProposalForm";
import { VoteCountdown } from "@/components/VoteCountdown";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession, isAdmin, isMember } from "@/lib/auth";
import { getProposals, type ProposalRow } from "@/lib/queries";
import { formatEventDateTime } from "@/lib/time";
import { VOTING_DAYS, decideProposal, quorumFor, type ProposalStatus } from "@/lib/votes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vote" };

const OUTCOME: Record<Exclude<ProposalStatus, "open">, string> = {
  passed: "Passed",
  rejected: "Rejected",
  "no-quorum": "Rejected — not enough votes",
  withdrawn: "Withdrawn",
};

/**
 * Proposed changes to the group. Each is open for a week; it passes if at least half
 * of all athletes vote and more vote Yes than No. The admin only moderates.
 */
export default async function VotePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/athletes/vote");
  if (!isMember(session)) redirect("/");

  const now = new Date();
  const proposals = (await getProposals(session.athleteId)).map((p) => ({
    p,
    status: decideProposal({ ...p, now }),
  }));
  const open = proposals.filter((x) => x.status === "open");
  const closed = proposals.filter((x) => x.status !== "open");

  const card = ({ p, status }: { p: ProposalRow; status: ProposalStatus }) => {
    const isOpen = status === "open";
    const mine = p.proposerId === session.athleteId;
    return (
      <article key={p.id} className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-paper">{p.title}</h3>
          {isOpen ? (
            <span className="eyebrow">Voting closes in <VoteCountdown closesAt={p.closesAt.toISOString()} /></span>
          ) : (
            <span className="eyebrow">{OUTCOME[status as Exclude<ProposalStatus, "open">]}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          Proposed by {p.proposerName} {formatEventDateTime(p.createdAt)}
        </p>
        {p.body ? <p className="mt-3 whitespace-pre-line text-sm text-paper">{p.body}</p> : null}
        <p className="tnum mt-4 text-sm text-muted">
          <span className="text-paper">{p.yes}</span> yes · <span className="text-paper">{p.no}</span> no ·{" "}
          {p.yes + p.no} of {quorumFor(p.eligible)} votes needed
        </p>
        {isOpen || isAdmin(session) ? (
          <ProposalActions
            proposalId={p.id}
            canVote={isOpen && session.athleteId !== null}
            myVote={p.myVote}
            canWithdraw={isOpen && mine}
            canRemove={isAdmin(session)}
          />
        ) : null}
      </article>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Athletes"
        title="Vote"
        actions={<LiveRefresh />}
        description={`Propose a change to the group. Everyone has ${VOTING_DAYS} days to vote; it passes if at least half of all athletes vote and more say Yes than No.`}
      />

      <section aria-labelledby="open-heading" className="mb-10">
        <h2 id="open-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
          Open for voting
        </h2>
        {open.length === 0 ? <EmptyState title="Nothing to vote on">No open proposals right now.</EmptyState> : <div className="space-y-4">{open.map(card)}</div>}
      </section>

      {session.athleteId ? (
        <section aria-labelledby="propose-heading" className="mb-10">
          <h2 id="propose-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
            Propose a change
          </h2>
          <ProposalForm openCount={open.filter((x) => x.p.proposerId === session.athleteId).length} />
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section aria-labelledby="closed-heading">
          <h2 id="closed-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
            Decided
          </h2>
          <div className="space-y-4">{closed.map(card)}</div>
        </section>
      ) : null}
    </>
  );
}
