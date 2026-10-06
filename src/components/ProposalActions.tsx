"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { castVote, clearVote, removeProposal, withdrawProposal } from "@/lib/athleteActions";
import { ConfirmDialog } from "./ConfirmDialog";

type Confirming = "clear" | "withdraw" | "remove";

const CONFIRM: Record<Confirming, { title: string; body: string; yes: string; busy: string }> = {
  clear: {
    title: "Clear your vote?",
    body: "Your vote won't count unless you vote again before voting closes.",
    yes: "Yes, clear",
    busy: "Clearing…",
  },
  withdraw: {
    title: "Withdraw this proposal?",
    body: "Voting ends now with no result.",
    yes: "Yes, withdraw",
    busy: "Withdrawing…",
  },
  remove: {
    title: "Remove this proposal?",
    body: "The proposal and all its votes are deleted. This can't be undone.",
    yes: "Yes, remove",
    busy: "Removing…",
  },
};

/**
 * Yes/No buttons for an athlete (their current choice highlighted, with a way to clear
 * it), withdraw for the proposer, remove for the admin. Clearing, withdrawing and
 * removing ask first, in a dialog. The server checks all of it again.
 */
export function ProposalActions({
  proposalId,
  canVote,
  myVote,
  canWithdraw,
  canRemove,
}: {
  proposalId: string;
  canVote: boolean;
  myVote: boolean | null;
  canWithdraw: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      setError(null);
      const result = await action();
      setConfirming(null);
      if (!result.ok) setError(result.message);
      router.refresh();
    });

  const confirmed = () => {
    if (confirming === "clear") return run(() => clearVote(proposalId));
    if (confirming === "withdraw") return run(() => withdrawProposal(proposalId));
    if (confirming === "remove") return run(() => removeProposal(proposalId));
  };

  // The text stays put while the dialog closes, rather than going blank first.
  const text = CONFIRM[confirming ?? "clear"];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canVote
        ? ([true, false] as const).map((inFavor) => (
            <button
              key={String(inFavor)}
              type="button"
              disabled={pending}
              aria-pressed={myVote === inFavor}
              onClick={() => run(() => castVote({ proposalId, inFavor }))}
              className={myVote === inFavor ? "btn" : "btn btn-ghost"}
            >
              {inFavor ? "Yes" : "No"}
            </button>
          ))
        : null}
      {canVote && myVote !== null ? (
        <button type="button" disabled={pending} onClick={() => setConfirming("clear")} className="btn btn-ghost">
          Clear my vote
        </button>
      ) : null}
      {canWithdraw ? (
        <button type="button" disabled={pending} onClick={() => setConfirming("withdraw")} className="btn btn-ghost">
          Withdraw
        </button>
      ) : null}
      {canRemove ? (
        <button type="button" disabled={pending} onClick={() => setConfirming("remove")} className="btn btn-ghost">
          Remove
        </button>
      ) : null}
      {error ? <span className="text-sm text-red-200">{error}</span> : null}
      <ConfirmDialog
        open={confirming !== null}
        title={text.title}
        confirmLabel={text.yes}
        busyLabel={text.busy}
        busy={pending}
        onConfirm={confirmed}
        onCancel={() => setConfirming(null)}
      >
        {text.body}
      </ConfirmDialog>
    </div>
  );
}
