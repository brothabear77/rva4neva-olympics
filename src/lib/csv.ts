import Papa from "papaparse";
import { scoreResult, type ScoringConfig } from "./scoring";

/**
 * CSV import for bulk result entry.
 *
 * These files get hand-made in Numbers or Google Sheets by whoever is keeping
 * score, so parsing is deliberately forgiving about header spelling and
 * whitespace — and deliberately strict about anything that would silently
 * record the wrong number.
 */

export const CSV_TEMPLATE = `event_slug,athlete_name,raw_value,notes
40-yard-dash,Nick,5.42,
cornhole-shootout,Dana,11,windy
`;

/** Accepted spellings for each column, lowercased with non-letters stripped. */
const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  event: "eventSlug",
  eventslug: "eventSlug",
  eventid: "eventSlug",
  eventname: "eventSlug",
  slug: "eventSlug",
  athlete: "athleteName",
  athletename: "athleteName",
  name: "athleteName",
  player: "athleteName",
  playername: "athleteName",
  person: "athleteName",
  personname: "athleteName",
  competitor: "athleteName",
  value: "rawValue",
  rawvalue: "rawValue",
  raw: "rawValue",
  result: "rawValue",
  measurement: "rawValue",
  score: "rawValue",
  time: "rawValue",
  distance: "rawValue",
  notes: "notes",
  note: "notes",
  comment: "notes",
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Map a spreadsheet's header to one of our fields. Falls back to dropping a
 * trailing "name"/"value", which covers the endless "Player Name", "Event
 * Name", "Raw Value" variations without listing every combination.
 */
function resolveHeader(header: string): string {
  const normalized = normalizeHeader(header);
  const direct = HEADER_ALIASES[normalized];
  if (direct) return direct;

  const trimmed = normalized.replace(/(name|value)$/, "");
  return HEADER_ALIASES[trimmed] ?? normalized;
}

export interface CsvRow {
  line: number;
  eventSlug: string;
  athleteName: string;
  rawValue: string;
  notes: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  /** Problems with the file itself, as opposed to an individual row. */
  fileErrors: string[];
  missingColumns: string[];
}

export function parseResultsCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: resolveHeader,
  });

  const fields = parsed.meta.fields ?? [];
  const missingColumns = (["eventSlug", "athleteName", "rawValue"] as const).filter(
    (required) => !fields.includes(required),
  );

  const fileErrors = parsed.errors
    .filter((e) => e.type !== "FieldMismatch")
    .map((e) => `Line ${(e.row ?? 0) + 2}: ${e.message}`);

  const rows: CsvRow[] = parsed.data.map((raw, index) => ({
    // +2: one for the header row, one because humans count from 1.
    line: index + 2,
    eventSlug: (raw.eventSlug ?? "").trim(),
    athleteName: (raw.athleteName ?? "").trim(),
    rawValue: (raw.rawValue ?? "").trim(),
    notes: (raw.notes ?? "").trim(),
  }));

  return { rows, fileErrors, missingColumns };
}

export type ImportAction = "create" | "update" | "unchanged" | "error";

export interface PreviewRow {
  line: number;
  eventSlug: string;
  athleteName: string;
  action: ImportAction;
  /** Set unless the row errored. */
  eventId?: string;
  eventName?: string;
  unitLabel?: string;
  decimals?: number;
  rawValue?: number;
  points?: number;
  notes?: string;
  previousRawValue?: number;
  previousPoints?: number;
  /** True when the athlete is not yet on the roster and will be added. */
  createsAthlete?: boolean;
  error?: string;
}

export interface ImportPreview {
  rows: PreviewRow[];
  counts: Record<ImportAction, number>;
  newAthletes: string[];
  fileErrors: string[];
  missingColumns: string[];
  /** Whether committing is allowed — any error row blocks the whole import. */
  canCommit: boolean;
}

export interface KnownEvent extends ScoringConfig {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  decimals: number;
}

export interface KnownResult {
  eventId: string;
  athleteId: string;
  rawValue: number;
  points: number;
}

/**
 * Turn parsed rows into a reviewable plan. Nothing here touches the database —
 * the caller supplies the current roster, events and results, which keeps this
 * testable and means the same function produces the preview and validates the
 * commit.
 *
 * Any single bad row blocks the entire import: a half-applied scoreboard is
 * worse than a rejected file.
 */
export function buildImportPreview(
  parsed: CsvParseResult,
  knownEvents: KnownEvent[],
  knownAthletes: Array<{ id: string; name: string }>,
  existingResults: KnownResult[],
): ImportPreview {
  const eventBySlug = new Map(knownEvents.map((e) => [e.slug.toLowerCase(), e]));
  const eventByName = new Map(knownEvents.map((e) => [e.name.toLowerCase(), e]));
  const athleteByName = new Map(knownAthletes.map((a) => [a.name.toLowerCase(), a]));
  const resultKey = (eventId: string, athleteId: string) => `${eventId}:${athleteId}`;
  const existing = new Map(existingResults.map((r) => [resultKey(r.eventId, r.athleteId), r]));

  const seen = new Map<string, number>();
  const newAthletes = new Set<string>();
  const counts: Record<ImportAction, number> = { create: 0, update: 0, unchanged: 0, error: 0 };

  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const base = { line: row.line, eventSlug: row.eventSlug, athleteName: row.athleteName };
    const fail = (error: string): PreviewRow => ({ ...base, action: "error", error });

    if (!row.eventSlug) return fail("Missing event");
    if (!row.athleteName) return fail("Missing athlete name");
    if (!row.rawValue) return fail("Missing measurement");

    const event =
      eventBySlug.get(row.eventSlug.toLowerCase()) ?? eventByName.get(row.eventSlug.toLowerCase());
    if (!event) return fail(`No event matches "${row.eventSlug}"`);

    const rawValue = Number(row.rawValue);
    if (!Number.isFinite(rawValue)) return fail(`"${row.rawValue}" is not a number`);

    const athlete = athleteByName.get(row.athleteName.toLowerCase());

    // Two rows scoring the same person in the same event: we cannot know which
    // one is meant, so refuse rather than let last-write-wins decide silently.
    const dedupeKey = `${event.id}:${row.athleteName.toLowerCase()}`;
    const firstSeenAt = seen.get(dedupeKey);
    if (firstSeenAt !== undefined) {
      return fail(`Duplicate of line ${firstSeenAt} — ${row.athleteName} appears twice for ${event.name}`);
    }
    seen.set(dedupeKey, row.line);

    const points = scoreResult(rawValue, event);
    const previous = athlete ? existing.get(resultKey(event.id, athlete.id)) : undefined;

    let action: ImportAction = "create";
    if (previous) {
      action = previous.rawValue === rawValue ? "unchanged" : "update";
    } else if (!athlete) {
      newAthletes.add(row.athleteName);
    }

    return {
      ...base,
      action,
      eventId: event.id,
      eventName: event.name,
      unitLabel: event.unitLabel,
      decimals: event.decimals,
      rawValue,
      points,
      notes: row.notes,
      previousRawValue: previous?.rawValue,
      previousPoints: previous?.points,
      createsAthlete: !athlete,
    };
  });

  for (const row of rows) counts[row.action] += 1;

  const canCommit =
    counts.error === 0 &&
    parsed.fileErrors.length === 0 &&
    parsed.missingColumns.length === 0 &&
    rows.length > 0;

  return {
    rows,
    counts,
    newAthletes: [...newAthletes],
    fileErrors: parsed.fileErrors,
    missingColumns: parsed.missingColumns,
    canCommit,
  };
}
