"use client";

import { useActionState } from "react";
import { restoreChange } from "@/lib/actions";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";
import type { ActionResult } from "@/lib/actions";
import type { ChangeLogRow } from "@/lib/queries";

/**
 * The change history.
 *
 * Submitting is open to anyone, so this page is the accountability: who changed
 * what, from what, to what. Nothing here can be edited or deleted — the
 * database refuses it — and "restore" appends a new entry rather than erasing
 * the ones after it, so the trail stays complete even while undoing.
 */

/** Fields worth showing per table; the rest are ids and timestamps. */
const INTERESTING: Record<string, Array<[string, string]>> = {
  results: [
    ["raw_value", "Mark"],
    ["points", "Points"],
    ["notes", "Notes"],
    ["submitted_by", "Posted by"],
  ],
  events: [
    ["name", "Name"],
    ["benchmark_1000", "1000-pt mark"],
    ["benchmark_zero", "0-pt mark"],
    ["decimals", "Decimals"],
  ],
  athletes: [["name", "Name"]],
};

const OPERATION_LABEL: Record<string, string> = {
  INSERT: "Added",
  UPDATE: "Changed",
  DELETE: "Removed",
  RESTORE: "Restored",
};

export function ChangeLogTable({ entries }: { entries: ChangeLogRow[] }) {
  const [name] = useScorekeeperName();
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => restoreChange(formData),
    null,
  );

  return (
    <div className="space-y-4">
      {state ? <Banner tone={state.ok ? "ok" : "error"}>{state.message}</Banner> : null}

      <ol className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-paper">
                  <span className="text-accent">
                    {OPERATION_LABEL[entry.operation] ?? entry.operation}
                  </span>{" "}
                  {entry.label}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.changedBy} ·{" "}
                  <time dateTime={new Date(entry.changedAt).toISOString()}>
                    {new Date(entry.changedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  {entry.restoredFromId ? ` · from change #${entry.restoredFromId}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="tnum text-xs text-muted">#{entry.id}</span>
                {entry.restoreTo ? (
                  <form action={formAction}>
                    <input type="hidden" name="entryId" value={entry.id} />
                    <input type="hidden" name="submittedBy" value={name} />
                    {/* The value is named on the button: on an entry that reads
                        "26.5 → 28", "Restore" alone does not say which you get. */}
                    <button
                      type="submit"
                      disabled={pending}
                      className="text-xs text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-50"
                    >
                      {entry.operation === "INSERT" ? "Restore " : "Undo — back to "}
                      <span className="tnum">{entry.restoreTo}</span>
                    </button>
                  </form>
                ) : null}
              </div>
            </div>

            <ChangeDetail entry={entry} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChangeDetail({ entry }: { entry: ChangeLogRow }) {
  const fields = INTERESTING[entry.tableName] ?? [];
  const before = entry.oldRow;
  const after = entry.newRow;

  const show = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  const changed = fields.filter(([key]) => {
    const wasSet = before ? show(before[key]) : null;
    const isSet = after ? show(after[key]) : null;
    if (!before || !after) return isSet !== null || wasSet !== null;
    return wasSet !== isSet;
  });

  if (changed.length === 0) return null;

  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[var(--edge)] pt-3 text-sm">
      {changed.map(([key, label]) => (
        <div key={key} className="flex items-baseline gap-2">
          <dt className="eyebrow">{label}</dt>
          <dd className="tnum">
            {before ? (
              <>
                <span className="text-muted line-through">{show(before[key])}</span>
                <span className="mx-1.5 text-muted">→</span>
              </>
            ) : null}
            <span className="text-paper">{after ? show(after[key]) : "removed"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
