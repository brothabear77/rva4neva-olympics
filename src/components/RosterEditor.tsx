"use client";

import { useState, useTransition } from "react";
import { addAthlete, deleteAthlete, renameAthlete, type ActionResult } from "@/lib/actions";
import { MAX_NAME_LENGTH, checkAthleteName, deletePrompt } from "@/lib/roster";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";

export interface RosterEntry {
  id: string;
  name: string;
  scores: number;
}

const LINK = "text-sm text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40";

/**
 * Who is on the roster: add someone, rename someone, remove someone.
 *
 * The score grid only ever shows this roster, so this is the one place a name is
 * fixed or a person is added. The same name rules run here as you type and again
 * on the server, which has the final say.
 *
 * Deleting is the one drastic thing here, because an athlete's scores go with
 * them. It asks first, says how many scores that is, and is undoable from Change
 * History (which brings the athlete back together with every score removed).
 */
export function RosterEditor({ roster }: { roster: RosterEntry[] }) {
  const [scorekeeper, setScorekeeper] = useScorekeeperName();
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; error: string | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [working, startWorking] = useTransition();

  /** Run a server action and show what it said; `onDone` only if it worked. */
  const run = (action: () => Promise<ActionResult<unknown>>, onDone: () => void) =>
    startWorking(async () => {
      setMessage(null);
      const result = await action();
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) onDone();
    });

  const submitAdd = () => {
    const check = checkAthleteName(newName, roster);
    if (!check.ok) return setAddError(check.error);
    setAddError(null);
    run(
      () => addAthlete({ name: check.name, submittedBy: scorekeeper }),
      () => setNewName(""),
    );
  };

  const submitRename = () => {
    if (!editing) return;
    const check = checkAthleteName(editing.text, roster, editing.id);
    if (!check.ok) return setEditing({ ...editing, error: check.error });

    const current = roster.find((a) => a.id === editing.id);
    if (current && check.name === current.name) return setEditing(null); // nothing changed

    run(
      () => renameAthlete({ id: editing.id, name: check.name, submittedBy: scorekeeper }),
      () => setEditing(null),
    );
  };

  const confirmDelete = (id: string) =>
    run(
      () => deleteAthlete({ id, submittedBy: scorekeeper }),
      () => setConfirming(null),
    );

  return (
    <section aria-labelledby="roster-heading" className="mt-12">
      <div className="mb-4">
        <p className="eyebrow mb-2">Who&apos;s competing</p>
        <h2 id="roster-heading" className="font-display text-2xl font-bold uppercase tracking-wide text-paper">
          Roster
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Add, rename or remove athletes. The score grid above shows exactly this list. Every change is
          recorded in the change history and can be undone from there.
        </p>
      </div>

      <div className="card space-y-5 p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rosterNew">
              Add an athlete
            </label>
            <div className="flex gap-2">
              <input
                id="rosterNew"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitAdd();
                  }
                }}
                maxLength={MAX_NAME_LENGTH * 2}
                autoComplete="off"
                placeholder="Their name"
                aria-invalid={addError ? true : undefined}
                aria-describedby={addError ? "rosterNewError" : undefined}
                className="field"
              />
              <button type="button" onClick={submitAdd} disabled={working} className="btn btn-ghost shrink-0">
                Add
              </button>
            </div>
            {addError ? (
              <p id="rosterNewError" className="mt-1.5 text-xs text-paper">
                {addError}
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="rosterBy">
              Your name
            </label>
            <input
              id="rosterBy"
              value={scorekeeper}
              onChange={(e) => setScorekeeper(e.target.value)}
              maxLength={80}
              placeholder="Recorded in the change history"
              className="field"
            />
          </div>
        </div>

        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        {roster.length === 0 ? (
          <p className="text-sm text-muted">Nobody is on the roster yet. Add the first athlete above.</p>
        ) : (
          <ul className="divide-y divide-[var(--edge)] border-y border-[var(--edge)]">
            {roster.map((athlete) => {
              const isEditing = editing?.id === athlete.id;
              const isConfirming = confirming === athlete.id;

              return (
                <li key={athlete.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  {isEditing && editing ? (
                    <>
                      <div className="min-w-[12rem] flex-1">
                        <label className="sr-only" htmlFor={`rename-${athlete.id}`}>
                          New name for {athlete.name}
                        </label>
                        <input
                          id={`rename-${athlete.id}`}
                          value={editing.text}
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value, error: null })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              submitRename();
                            } else if (e.key === "Escape") {
                              setEditing(null);
                            }
                          }}
                          maxLength={MAX_NAME_LENGTH * 2}
                          autoComplete="off"
                          aria-invalid={editing.error ? true : undefined}
                          className="field"
                        />
                        {editing.error ? <p className="mt-1.5 text-xs text-paper">{editing.error}</p> : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={submitRename} disabled={working} className="text-sm font-semibold text-accent hover:underline disabled:opacity-40">
                          {working ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className={LINK}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-[10rem] flex-1">
                        <span className="font-display text-base font-semibold uppercase tracking-wide text-paper">
                          {athlete.name}
                        </span>
                        <span className="tnum ml-3 text-xs text-muted">
                          {athlete.scores} score{athlete.scores === 1 ? "" : "s"}
                        </span>
                      </div>

                      {isConfirming ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm text-paper">{deletePrompt(athlete.name, athlete.scores)}</span>
                          <button
                            type="button"
                            onClick={() => confirmDelete(athlete.id)}
                            disabled={working}
                            className="text-sm font-semibold text-accent hover:underline disabled:opacity-40"
                          >
                            {working ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className={LINK}>
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(null);
                              setEditing({ id: athlete.id, text: athlete.name, error: null });
                            }}
                            aria-label={`Rename ${athlete.name}`}
                            className={LINK}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setConfirming(athlete.id);
                            }}
                            aria-label={`Delete ${athlete.name}`}
                            className={LINK}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted">
          A bio or photo on the Athletes page is matched by name, so renaming someone may mean updating
          theirs too.
        </p>
      </div>
    </section>
  );
}
