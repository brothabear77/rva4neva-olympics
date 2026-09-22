/**
 * Logic behind the score grid on the Submit page.
 *
 * The grid is a sheet with a cell per athlete and event. What gets saved is only
 * the cells that differ from what is already stored, so this file decides what
 * typed text means and which cells count as changed. It is pure, so it can be
 * tested without a browser or a database.
 */

/** Same ceiling the database column and the server use. */
export const MAX_RAW_VALUE = 1e8;

/** Decimal places the results.raw_value column keeps (numeric(12,4)). */
const RAW_VALUE_DECIMALS = 4;

export type CellValue =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "number"; value: number };

/**
 * Can this text still become a number by typing more? Digits, at most one dot,
 * an optional leading minus. Anything else is refused as it is typed, so "5." and
 * "-" are allowed on the way to "5.4" and "-3".
 */
export function isPartialNumber(text: string): boolean {
  return /^-?\d*\.?\d*$/.test(text);
}

/** What a cell's text means once typing has stopped. */
export function parseCell(text: string): CellValue {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };

  // A lone "-" or "." passes isPartialNumber but is not a measurement.
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { kind: "invalid" };

  // Round to what the database keeps. Otherwise 5.123456 would be saved as
  // 5.1235, come back as 5.1235, and never equal what was typed, so the cell
  // would count as changed forever. Range-check after rounding: 99999999.99999
  // rounds up to 100000000, which the column cannot hold.
  const factor = 10 ** RAW_VALUE_DECIMALS;
  const value = Math.round(Number(trimmed) * factor) / factor;
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_RAW_VALUE) return { kind: "invalid" };
  return { kind: "number", value };
}

/** A row of the grid: one athlete on the roster. (Athletes are added from the roster editor.) */
export interface GridRow {
  athleteId: string;
  name: string;
}

export const cellKey = (athleteId: string, eventId: string) => `${athleteId}|${eventId}`;

/** One score to write. The grid only ever adds or replaces; it never removes. */
export interface GridChange {
  athleteId: string;
  athleteName: string;
  eventId: string;
  value: number;
}

export interface GridSubmission {
  submittedBy: string;
  changes: GridChange[];
}

export interface GridDiff {
  changes: GridChange[];
  /** Cells whose text is not a usable number. Saving is blocked while any exist. */
  invalidKeys: Set<string>;
  /** Cells that will be written or removed, for highlighting. */
  changedKeys: Set<string>;
}

/**
 * Compare what has been typed against what is stored.
 *
 * `edits` holds text only for cells someone touched. A touched cell that ends up
 * equal to the stored value is not a change: retyping 5.42 over 5.42, or typing
 * 5.420, must not write anything, or the change history fills with no-ops.
 * Compared as numbers, not strings, for the same reason.
 *
 * A blank cell is never a change. Stored scores show in the grid as placeholders,
 * so a blank cell means "I have nothing to say here", not "delete this" — and a
 * wide-open site should not lose a score to someone clearing a box.
 */
export function collectChanges(
  rows: readonly GridRow[],
  eventIds: readonly string[],
  original: ReadonlyMap<string, number>,
  edits: Readonly<Record<string, string>>,
): GridDiff {
  const changes: GridChange[] = [];
  const invalidKeys = new Set<string>();
  const changedKeys = new Set<string>();

  for (const row of rows) {
    for (const eventId of eventIds) {
      const key = cellKey(row.athleteId, eventId);
      if (!(key in edits)) continue;

      const cell = parseCell(edits[key]);

      if (cell.kind === "invalid") {
        invalidKeys.add(key);
      } else if (cell.kind === "number" && cell.value !== original.get(key)) {
        changes.push({ athleteId: row.athleteId, athleteName: row.name, eventId, value: cell.value });
        changedKeys.add(key);
      }
    }
  }

  return { changes, invalidKeys, changedKeys };
}

/** One stored score to delete. Only scores that exist can be deleted, so there is always an athlete id. */
export interface GridDelete {
  athleteId: string;
  athleteName: string;
  eventId: string;
}

export interface GridDeletion {
  submittedBy: string;
  cells: GridDelete[];
}

export interface DeleteDiff {
  cells: GridDelete[];
  /** Cells that will be deleted, for highlighting. */
  changedKeys: Set<string>;
}

/**
 * Delete mode: which stored scores were emptied.
 *
 * In this mode the grid is filled with what is stored, and the only thing that
 * counts is a cell that held a score and is now empty. Anything else is not a
 * deletion: an empty cell that never held a score has nothing to delete, and
 * text left in a cell is a score that stays. This is the mirror of `collectChanges`, which never deletes.
 */
export function collectDeletions(
  rows: readonly GridRow[],
  eventIds: readonly string[],
  original: ReadonlyMap<string, number>,
  edits: Readonly<Record<string, string>>,
): DeleteDiff {
  const cells: GridDelete[] = [];
  const changedKeys = new Set<string>();

  for (const row of rows) {
    for (const eventId of eventIds) {
      const key = cellKey(row.athleteId, eventId);
      if (!(key in edits) || !original.has(key)) continue;
      if (parseCell(edits[key]).kind !== "empty") continue;

      cells.push({ athleteId: row.athleteId, athleteName: row.name, eventId });
      changedKeys.add(key);
    }
  }

  return { cells, changedKeys };
}
