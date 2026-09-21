"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteScores, submitGrid } from "@/lib/actions";
import {
  cellKey,
  collectChanges,
  collectDeletions,
  isPartialNumber,
  parseCell,
  type GridChange,
  type GridDelete,
  type GridRow,
} from "@/lib/grid";
import { scoreResult } from "@/lib/scoring";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";
import type { Athlete, Event } from "@/lib/schema";

export interface StoredResult {
  athleteId: string;
  eventId: string;
  rawValue: number;
}

type Mode = "add" | "delete";

/** What was just saved, kept until the server's refreshed scores show it. */
type Saved = { kind: "add"; changes: GridChange[] } | { kind: "delete"; cells: GridDelete[] } | null;

const NO_KEYS: ReadonlySet<string> = new Set();

const HEAD_CELL = "border-b border-[var(--edge)] py-2 transition-colors duration-150";

/**
 * The athlete column is pinned when the grid scrolls sideways, and a pinned cell
 * needs a solid fill or the cells sliding under it show through. The
 * heading of the focused cell's row and column gets a faint wash of the accent
 * instead — one or the other, never both, since two background utilities on one
 * element would fight and the winner would depend on stylesheet order.
 */
const FILL = "bg-[var(--raise)]";
const FILL_ACTIVE = "bg-[color-mix(in_oklab,var(--color-accent)_12%,var(--raise))]";

/**
 * A scoresheet: one column per event across the top, one row per athlete down
 * the side, a cell for each pairing. A toggle switches it between two jobs, and
 * each job is deliberately one-directional. Who is on the roster is managed
 * separately, in the roster editor below the grid.
 *
 * ADD mode. Every cell starts empty. A score that is already stored shows as a
 * gray placeholder (with its points underneath). Type in a cell to add or replace
 * a score, and the points update as you type. Only cells you typed a different
 * number into are sent. A blank cell is never sent, so nothing is erased here.
 *
 * DELETE mode. Cells are filled in with the stored scores. Emptying a cell and
 * saving deletes that score. Nothing can be added or changed here: any edit to a
 * filled cell just empties it, so a stray keystroke can only ever mean "delete",
 * never "alter".
 *
 * They use separate server actions, so saving scores structurally cannot delete.
 * The toggle locks while there are unsaved changes, so the two kinds of change can
 * never end up in one save.
 *
 * `edits` holds text only for cells someone touched. After a save it is cleared,
 * but only once the refreshed scores have arrived. Clearing it sooner would flash
 * the old value for a moment, which looks like the save did not take.
 */
export function ScoreGrid({
  events,
  athletes,
  results,
}: {
  events: Event[];
  athletes: Athlete[];
  results: StoredResult[];
}) {
  const [scorekeeper, setScorekeeper] = useScorekeeperName();
  const [mode, setMode] = useState<Mode>("add");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // The cell with focus, by athlete and event id, so its headings can light up.
  const [active, setActive] = useState<{ athlete: string; event: string } | null>(null);
  const [saved, setSaved] = useState<Saved>(null);
  const [saving, startSaving] = useTransition();
  const tableRef = useRef<HTMLTableElement>(null);

  const deleting = mode === "delete";

  const original = useMemo(
    () => new Map(results.map((r) => [cellKey(r.athleteId, r.eventId), r.rawValue])),
    [results],
  );

  const rows: GridRow[] = useMemo(() => athletes.map((a) => ({ athleteId: a.id, name: a.name })), [athletes]);

  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const addDiff = useMemo(
    () => collectChanges(rows, eventIds, original, edits),
    [rows, eventIds, original, edits],
  );
  const deleteDiff = useMemo(
    () => collectDeletions(rows, eventIds, original, edits),
    [rows, eventIds, original, edits],
  );

  const changedKeys = deleting ? deleteDiff.changedKeys : addDiff.changedKeys;
  const invalidKeys = deleting ? NO_KEYS : addDiff.invalidKeys;
  const pending = deleting ? deleteDiff.cells.length : addDiff.changes.length;
  const invalid = invalidKeys.size;
  const canSave = pending > 0 && invalid === 0 && !saving;
  // Anything worth losing if the mode flipped now.
  const hasUnsaved = pending > 0 || invalid > 0;

  // Reset the typed text only once the server's refreshed scores reflect what was
  // just saved.
  useEffect(() => {
    if (!saved) return;
    const reflected =
      saved.kind === "delete"
        ? saved.cells.every((cell) => !original.has(cellKey(cell.athleteId, cell.eventId)))
        : saved.changes.every((change) => original.get(cellKey(change.athleteId, change.eventId)) === change.value);
    if (reflected) {
      setEdits({});
      setSaved(null);
    }
  }, [saved, original]);

  const switchMode = (next: Mode) => {
    // Locked while there is unsaved work, so a save is only ever one kind of change.
    if (next === mode || hasUnsaved) return;
    setMode(next);
    setEdits({});
    setSaved(null);
    setMessage(null);
    setActive(null);
  };

  // --- add mode -------------------------------------------------------------

  const setCell = (key: string, text: string) => {
    // Refuse anything that could never become a number, as it is typed.
    if (!isPartialNumber(text)) return;
    setEdits((prev) => ({ ...prev, [key]: text }));
    setMessage(null);
  };

  // --- delete mode ----------------------------------------------------------

  /** Any edit to a filled cell empties it. Cells with no score have nothing to empty. */
  const emptyCell = (key: string, hasScore: boolean) => {
    if (!hasScore) return;
    setEdits((prev) => ({ ...prev, [key]: "" }));
    setMessage(null);
  };

  const restoreCell = (key: string) =>
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));

  // --- shared ---------------------------------------------------------------

  /** Enter and the arrow keys move between rows, as in a spreadsheet. */
  const onCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    let target: number | null = null;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) target = r + 1;
    else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) target = r - 1;
    if (target === null) return;

    e.preventDefault();
    const next = tableRef.current?.querySelector<HTMLInputElement>(`[data-r="${target}"][data-c="${c}"]`);
    next?.focus();
    next?.select();
  };

  const discard = () => {
    setSaved(null);
    setEdits({});
    setMessage(null);
  };

  const save = () =>
    startSaving(async () => {
      setMessage(null);
      if (deleting) {
        const cells = deleteDiff.cells;
        const result = await deleteScores({ submittedBy: scorekeeper, cells });
        setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
        if (result.ok) setSaved({ kind: "delete", cells });
      } else {
        const changes = addDiff.changes;
        const result = await submitGrid({ submittedBy: scorekeeper, changes });
        setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
        if (result.ok) setSaved({ kind: "add", changes });
      }
    });

  if (events.length === 0) {
    return <Banner tone="error">There are no events to score yet. Load the schedule first.</Banner>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="What the grid does"
          className="inline-flex rounded-lg border border-[var(--edge-strong)] p-1"
        >
          {(["add", "delete"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={mode !== m && hasUnsaved}
              onClick={() => switchMode(m)}
              className={[
                "min-h-9 rounded-md px-4 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                mode === m ? "bg-accent text-ink" : "text-muted hover:text-paper",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted",
              ].join(" ")}
            >
              {m === "add" ? "Add scores" : "Delete scores"}
            </button>
          ))}
        </div>
        {hasUnsaved ? (
          <span className="text-xs text-muted">Save or discard your changes to switch modes.</span>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        {deleting ? (
          <>
            Every saved score is filled in. Empty a cell to delete that score, then save. Editing a
            filled cell empties it, and cells with no score can&apos;t be deleted. Enter or the arrow
            keys move up and down a column.
          </>
        ) : (
          <>
            Scores already saved show in gray. Type in a cell to add or replace one — points show
            underneath as you go — and cells you leave blank are never changed. Enter or the arrow
            keys move up and down a column.
          </>
        )}
      </p>

      {/* Static on the page: the grid takes its full height and the page scrolls,
          so there is no scroll box to get stuck in. The one exception is a screen
          too narrow for ten columns, where it scrolls sideways (with the athlete
          names pinned) instead of stretching the whole page. */}
      <div className="card overflow-x-auto">
        <table ref={tableRef} className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            {deleting
              ? "Score grid, delete mode. One row per athlete and one column per event; empty a cell to delete that score."
              : "Score grid. One row per athlete and one column per event; type a result in a cell."}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD_CELL} ${FILL} sticky left-0 z-10 min-w-32 px-3`}>
                <span className="eyebrow">Athlete</span>
              </th>
              {events.map((event) => {
                const on = active?.event === event.id;
                return (
                  <th
                    key={event.id}
                    scope="col"
                    className={[
                      HEAD_CELL,
                      "min-w-[5.75rem] px-1 text-center",
                      // Inset shadow, not a border: a thicker border would nudge the layout.
                      on ? `${FILL_ACTIVE} shadow-[inset_0_-2px_0_var(--color-accent)]` : FILL,
                    ].join(" ")}
                  >
                    <span className="eyebrow block">Day {event.day}</span>
                    <span
                      className={[
                        "mt-1 block font-display text-xs font-semibold uppercase leading-tight tracking-wide transition-colors duration-150",
                        on ? "text-accent" : "text-paper",
                      ].join(" ")}
                    >
                      {event.name}
                    </span>
                    {event.unitLabel ? (
                      <span className="mt-0.5 block text-[0.6875rem] font-normal text-muted">{event.unitLabel}</span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, r) => (
              <tr key={row.athleteId}>
                <th
                  scope="row"
                  className={[
                    "sticky left-0 z-10 border-b border-[var(--edge)] px-3 py-1 text-left transition-colors duration-150",
                    active?.athlete === row.athleteId
                      ? `${FILL_ACTIVE} shadow-[inset_-2px_0_0_var(--color-accent)]`
                      : FILL,
                  ].join(" ")}
                >
                  <span
                    className={[
                      "font-display text-sm font-semibold uppercase tracking-wide transition-colors duration-150",
                      active?.athlete === row.athleteId ? "text-accent" : "text-paper",
                    ].join(" ")}
                  >
                    {row.name}
                  </span>
                </th>

                {events.map((event, c) => {
                  const key = cellKey(row.athleteId, event.id);
                  const stored = original.get(key);
                  const hasScore = stored !== undefined;
                  const changed = changedKeys.has(key);
                  const bad = invalidKeys.has(key);
                  const cleared = deleting && changed; // a stored score this save will delete

                  // What the input holds, and what it shows when it holds nothing.
                  const text = deleting ? (hasScore && !cleared ? String(stored) : "") : (edits[key] ?? "");
                  const placeholder = hasScore && (!deleting || cleared) ? String(stored) : "";

                  // Points for what is typed, or for the stored score while the cell is blank.
                  const typed = parseCell(text);
                  const shown = typed.kind === "number" ? typed.value : stored;
                  const points = shown !== undefined ? scoreResult(shown, event) : null;

                  const what = `${row.name}, ${event.name}${event.unitLabel ? ` (${event.unitLabel})` : ""}`;

                  return (
                    <td key={event.id} className="border-b border-[var(--edge)] px-1 py-1 align-top">
                      <input
                        data-r={r}
                        data-c={c}
                        value={text}
                        onChange={(e) => (deleting ? emptyCell(key, hasScore) : setCell(key, e.target.value))}
                        onKeyDown={(e) => onCellKeyDown(e, r, c)}
                        onFocus={(e) => {
                          e.currentTarget.select();
                          setActive({ athlete: row.athleteId, event: event.id });
                        }}
                        // Moving to another cell in the grid keeps the highlight
                        // rolling; leaving the grid (Save, the name box...) clears it.
                        onBlur={(e) => {
                          const to = e.relatedTarget;
                          if (!(to instanceof HTMLInputElement && tableRef.current?.contains(to))) setActive(null);
                        }}
                        // With nothing to delete a cell is inert, but still focusable so the
                        // keyboard can move through the grid without skipping around it.
                        readOnly={deleting && !hasScore}
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        // The placeholder is not reliably read out, so say the stored score here.
                        placeholder={placeholder}
                        aria-label={
                          deleting
                            ? `${what}, ${
                                !hasScore ? "no score to delete" : cleared ? `will delete score ${stored}` : `score ${stored}, empty to delete`
                              }`
                            : `${what}, ${hasScore ? `saved score ${stored}` : "no score yet"}`
                        }
                        aria-invalid={bad || undefined}
                        className={[
                          "field tnum h-10 min-h-0 scroll-mt-28 px-1 text-center placeholder:text-muted",
                          changed ? "border-accent" : "",
                          cleared ? "border-dashed" : "",
                          bad ? "border-dashed border-paper" : "",
                          deleting && !hasScore ? "opacity-40" : "",
                        ].join(" ")}
                      />
                      {/* Always one line tall, so typing a value does not shift the row. */}
                      <span
                        className={[
                          "tnum mt-0.5 block h-4 text-center text-[0.6875rem] leading-4",
                          changed ? "text-accent" : "text-muted",
                        ].join(" ")}
                      >
                        {cleared ? (
                          <button
                            type="button"
                            onClick={() => restoreCell(key)}
                            aria-label={`Undo deleting ${what}`}
                            className="underline underline-offset-2"
                          >
                            undo
                          </button>
                        ) : bad ? (
                          "not a number"
                        ) : points !== null ? (
                          `${points} pts`
                        ) : (
                          ""
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-md">
        <label className="label" htmlFor="gridBy">
          Your name
        </label>
        <input
          id="gridBy"
          value={scorekeeper}
          onChange={(e) => setScorekeeper(e.target.value)}
          maxLength={80}
          placeholder="Recorded in the change history"
          className="field"
        />
      </div>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!canSave} className="btn">
          {saving
            ? deleting
              ? "Deleting…"
              : "Saving…"
            : deleting
              ? // Always carries the count, so it never reads the same as the mode toggle.
                `Delete ${pending} score${pending === 1 ? "" : "s"}`
              : "Save changes"}
        </button>
        <button type="button" onClick={discard} disabled={saving || !hasUnsaved} className="btn btn-ghost">
          Discard
        </button>
        <p className="tnum text-sm text-muted" aria-live="polite">
          {invalid > 0
            ? `${invalid} cell${invalid === 1 ? " isn't" : "s aren't"} a number — fix ${invalid === 1 ? "it" : "them"} to save`
            : pending === 0
              ? deleting
                ? "Nothing to delete yet"
                : "No changes yet"
              : deleting
                ? `${pending} score${pending === 1 ? "" : "s"} will be deleted`
                : `${pending} change${pending === 1 ? "" : "s"}`}
        </p>
      </div>

      <p className="text-xs text-muted">
        Everything is recorded in the change history, and any score can be brought back from
        there.
      </p>
    </div>
  );
}
