"use client";

import { useState, useTransition } from "react";
import { approveClaim, rejectClaim, removeAccount, setScorekeeper } from "@/lib/authActions";
import type { ActionResult } from "@/lib/actions";
import { Banner } from "./ui";

const LINK = "text-sm text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40";

type Message = { tone: "ok" | "error"; text: string } | null;

/** Run a server action and remember what it said. */
function useRunner() {
  const [message, setMessage] = useState<Message>(null);
  const [working, startWorking] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>) =>
    startWorking(async () => {
      setMessage(null);
      const result = await action();
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    });
  return { message, working, run };
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 id={id} className="font-display text-2xl font-bold uppercase tracking-wide text-paper">
        {title}
      </h2>
      {children ? <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p> : null}
    </div>
  );
}

export interface ClaimView {
  id: string;
  athleteName: string;
  phone: string;
  requestedAt: string;
}

export function ClaimsPanel({ claims }: { claims: ClaimView[] }) {
  const { message, working, run } = useRunner();

  return (
    <section aria-labelledby="claims-heading">
      <SectionHeading id="claims-heading" eyebrow="Waiting on you" title="Claims">
        Check the phone number is really theirs. Approving or rejecting deletes the number either way.
      </SectionHeading>

      <div className="card space-y-4 p-4 sm:p-6">
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        {claims.length === 0 ? (
          <p className="text-sm text-muted">No claims waiting.</p>
        ) : (
          <ul className="divide-y divide-[var(--edge)] border-y border-[var(--edge)]">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">{claim.athleteName}</p>
                  <p className="tnum text-sm text-muted">
                    {claim.phone} · {claim.requestedAt}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" disabled={working} onClick={() => run(() => approveClaim(claim.id))} className="btn">
                    Approve
                  </button>
                  <button type="button" disabled={working} onClick={() => run(() => rejectClaim(claim.id))} className="btn btn-ghost">
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export interface AccountView {
  id: string;
  name: string;
  role: "athlete" | "scorekeeper" | "admin";
  isStaff: boolean;
}

const ROLE_LABEL: Record<AccountView["role"], string> = {
  athlete: "Athlete",
  scorekeeper: "Scorekeeper",
  admin: "Admin",
};

export function AccountsPanel({ accounts }: { accounts: AccountView[] }) {
  const { message, working, run } = useRunner();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section aria-labelledby="accounts-heading" className="mt-12">
      <SectionHeading id="accounts-heading" eyebrow="Who can sign in" title="Accounts">
        Removing an athlete&apos;s account signs them out and lets their athlete be claimed again. Their profile stays.
      </SectionHeading>

      <div className="card space-y-4 p-4 sm:p-6">
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">No accounts yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--edge)] border-y border-[var(--edge)]">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">{account.name}</p>
                  <p className="text-sm text-muted">
                    {ROLE_LABEL[account.role]}
                    {account.isStaff ? " · staff login" : ""}
                  </p>
                </div>
                {account.isStaff ? null : (
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={account.role === "scorekeeper"}
                        disabled={working}
                        onChange={(e) => run(() => setScorekeeper({ accountId: account.id, on: e.target.checked }))}
                      />
                      Can enter scores
                    </label>
                    {confirming === account.id ? (
                      <span className="flex items-center gap-3">
                        <span className="text-sm text-paper">Remove {account.name}&apos;s account?</span>
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => {
                            setConfirming(null);
                            run(() => removeAccount(account.id));
                          }}
                          className={LINK}
                        >
                          Yes, remove
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className={LINK}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" disabled={working} onClick={() => setConfirming(account.id)} className={LINK}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
