"use client";

import { useState, useTransition } from "react";
import { deleteAthlete, setRegistrationLocked, setScorekeeper } from "@/lib/authActions";
import type { ActionResult } from "@/lib/actions";
import { ConfirmDialog } from "./ConfirmDialog";
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

export function RegistrationPanel({ locked }: { locked: boolean }) {
  const { message, working, run } = useRunner();

  return (
    <section aria-labelledby="registration-heading" className="mb-12">
      <SectionHeading id="registration-heading" eyebrow="Who can join" title="Registration">
        Anyone can sign up as a new athlete and is on the roster, with an account, straight away. Locking registration stops new
        sign-ups. Athletes who already have an account are unaffected.
      </SectionHeading>

      <div className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
        <div>
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">
            {locked ? "Locked" : "Open"}
          </p>
          <p className="text-sm text-muted">
            {locked ? "The sign-up page tells people registration is closed." : "Anyone can sign up as a new athlete."}
          </p>
        </div>
        <button
          type="button"
          disabled={working}
          onClick={() => run(() => setRegistrationLocked(!locked))}
          className={locked ? "btn" : "btn btn-ghost"}
        >
          {working ? "Saving…" : locked ? "Unlock registration" : "Lock registration"}
        </button>
        {message ? (
          <div className="w-full">
            <Banner tone={message.tone}>{message.text}</Banner>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface AccountView {
  id: string;
  name: string;
  username: string;
  athleteId: string | null;
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
  const [removing, setRemoving] = useState<AccountView | null>(null);

  return (
    <section aria-labelledby="accounts-heading" className="mt-12">
      <SectionHeading id="accounts-heading" eyebrow="Who can sign in" title="Accounts">
        Deleting an athlete removes them completely: account, profile and every score. Staff logins are managed with npm run auth:staff.
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
                    {account.username} · {ROLE_LABEL[account.role]}
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
                    <button type="button" disabled={working} onClick={() => setRemoving(account)} className={LINK}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Delete ${removing.name}?` : ""}
        confirmLabel="Yes, delete"
        busyLabel="Deleting…"
        busy={working}
        onConfirm={() => {
          const athleteId = removing?.athleteId;
          if (!athleteId) return;
          setRemoving(null);
          run(() => deleteAthlete(athleteId));
        }}
        onCancel={() => setRemoving(null)}
      >
        Their account, profile, walkout song, scores, practice log, votes, proposals and videos all go, and they disappear from every event. This can&apos;t be undone, including from Change History.
      </ConfirmDialog>
    </section>
  );
}
