"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProposal } from "@/lib/athleteActions";
import { MAX_OPEN_PROPOSALS, MAX_PROPOSAL_BODY_LENGTH, MAX_TITLE_LENGTH, VOTING_DAYS } from "@/lib/votes";
import { Banner } from "./ui";

/** `openCount` is how many of the athlete's proposals are open now; at the limit the form is disabled. */
export function ProposalForm({ openCount }: { openCount: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const atLimit = openCount >= MAX_OPEN_PROPOSALS;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      setMessage(null);
      const result = await createProposal({ title, body });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) {
        setTitle("");
        setBody("");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-6">
      <div>
        <label className="label" htmlFor="proposalTitle">
          Proposal
        </label>
        <input
          id="proposalTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="What should the group change?"
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="proposalBody">
          Details <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="proposalBody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_PROPOSAL_BODY_LENGTH}
          rows={5}
          placeholder="Why, and how it would work."
          className="field"
        />
      </div>
      <p className="text-xs text-muted">
        Everyone gets {VOTING_DAYS} days to vote. It passes if at least half of all athletes vote and more say Yes than No.
        You can have {MAX_OPEN_PROPOSALS} open at a time (you have {openCount}).
      </p>
      {atLimit ? (
        <Banner tone="error">
          You have {MAX_OPEN_PROPOSALS} proposals open. Withdraw one, or wait for one to close, to post another.
        </Banner>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={saving || atLimit || title.trim().length < 3} className="btn">
        {saving ? "Posting…" : "Post proposal"}
      </button>
    </form>
  );
}
