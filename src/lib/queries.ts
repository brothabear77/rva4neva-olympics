import "server-only";
import { asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { athletes, changeLog, events, results } from "./schema";
import { formatMeasurement } from "./scoring";
import type { Event } from "./schema";

/**
 * Read models for the pages.
 *
 * The whole competition is a few hundred rows at most, so the leaderboard is
 * assembled from one flat join rather than several aggregate round trips. That
 * keeps the per-event breakdown available without a second query.
 */

export interface ResultRow {
  id: string;
  eventId: string;
  eventSlug: string;
  eventName: string;
  eventUnit: string;
  eventDecimals: number;
  athleteId: string;
  athleteName: string;
  rawValue: number;
  points: number;
  notes: string;
  submittedBy: string;
  source: "ui" | "csv" | "restore";
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  athleteName: string;
  totalPoints: number;
  eventsCompleted: number;
  best: ResultRow | null;
  byEventId: Record<string, ResultRow>;
}

const resultSelection = {
  id: results.id,
  eventId: results.eventId,
  eventSlug: events.slug,
  eventName: events.name,
  eventUnit: events.unitLabel,
  eventDecimals: events.decimals,
  athleteId: results.athleteId,
  athleteName: athletes.name,
  rawValue: results.rawValue,
  points: results.points,
  notes: results.notes,
  submittedBy: results.submittedBy,
  source: results.source,
  createdAt: results.createdAt,
  updatedAt: results.updatedAt,
} as const;

function allResults() {
  return db
    .select(resultSelection)
    .from(results)
    .innerJoin(events, eq(events.id, results.eventId))
    .innerJoin(athletes, eq(athletes.id, results.athleteId));
}

/**
 * Standings for every athlete on the roster, including those yet to score —
 * seeing your name at 0 is part of the fun.
 *
 * Ties share a rank and consume the places below them (1, 2, 2, 4), the way a
 * real scoreboard reads.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const [roster, rows] = await Promise.all([
    db.select().from(athletes).orderBy(asc(athletes.name)),
    allResults(),
  ]);

  const byAthlete = new Map<string, LeaderboardEntry>(
    roster.map((a) => [
      a.id,
      {
        rank: 0,
        athleteId: a.id,
        athleteName: a.name,
        totalPoints: 0,
        eventsCompleted: 0,
        best: null,
        byEventId: {},
      },
    ]),
  );

  for (const row of rows) {
    const entry = byAthlete.get(row.athleteId);
    if (!entry) continue;
    entry.totalPoints += row.points;
    entry.eventsCompleted += 1;
    entry.byEventId[row.eventId] = row;
    if (!entry.best || row.points > entry.best.points) entry.best = row;
  }

  const sorted = [...byAthlete.values()].sort(
    (a, b) => b.totalPoints - a.totalPoints || a.athleteName.localeCompare(b.athleteName),
  );

  let previousPoints: number | null = null;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    if (previousPoints !== null && entry.totalPoints === previousPoints) {
      entry.rank = previousRank;
    } else {
      entry.rank = index + 1;
      previousRank = entry.rank;
      previousPoints = entry.totalPoints;
    }
  });

  return sorted;
}

export interface EventSummary extends Event {
  resultCount: number;
  leaderName: string | null;
  leaderPoints: number | null;
  leaderRaw: number | null;
}

export async function getEventSummaries(): Promise<EventSummary[]> {
  const [list, rows] = await Promise.all([
    db.select().from(events).orderBy(asc(events.day), asc(events.sortOrder), asc(events.name)),
    allResults(),
  ]);

  const byEvent = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const bucket = byEvent.get(row.eventId);
    if (bucket) bucket.push(row);
    else byEvent.set(row.eventId, [row]);
  }

  return list.map((event) => {
    const bucket = (byEvent.get(event.id) ?? []).sort((a, b) => b.points - a.points);
    const leader = bucket[0] ?? null;
    return {
      ...event,
      resultCount: bucket.length,
      leaderName: leader?.athleteName ?? null,
      leaderPoints: leader?.points ?? null,
      leaderRaw: leader?.rawValue ?? null,
    };
  });
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return event ?? null;
}

/** One event's results, best first. */
export async function getEventResults(eventId: string): Promise<ResultRow[]> {
  return db
    .select(resultSelection)
    .from(results)
    .innerJoin(events, eq(events.id, results.eventId))
    .innerJoin(athletes, eq(athletes.id, results.athleteId))
    .where(eq(results.eventId, eventId))
    .orderBy(desc(results.points));
}

export async function getRecentResults(limit = 10): Promise<ResultRow[]> {
  return db
    .select(resultSelection)
    .from(results)
    .innerJoin(events, eq(events.id, results.eventId))
    .innerJoin(athletes, eq(athletes.id, results.athleteId))
    .orderBy(desc(results.updatedAt))
    .limit(limit);
}

export async function getEventsForForm() {
  return db
    .select()
    .from(events)
    .where(eq(events.isActive, true))
    .orderBy(asc(events.day), asc(events.sortOrder), asc(events.name));
}

export async function getAthletes() {
  return db.select().from(athletes).orderBy(asc(athletes.name));
}

export interface ChangeLogRow {
  id: number;
  tableName: string;
  recordId: string | null;
  operation: string;
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
  changedBy: string;
  changedAt: Date;
  restoredFromId: number | null;
  /** Resolved for display — the audit row stores ids, not names. */
  label: string;
  /**
   * The value the Restore button on this entry would put back, already
   * formatted. Null when this entry is not restorable. Naming the value on the
   * button is what keeps "restore" unambiguous on an entry that reads 26.5 -> 28.
   */
  restoreTo: string | null;
}

/**
 * History, newest first. Ids in the stored jsonb are resolved to event and
 * athlete names here so the page can read like a sentence.
 */
export async function getChangeLog(limit = 100, before?: number): Promise<ChangeLogRow[]> {
  const rows = await db
    .select()
    .from(changeLog)
    .where(before ? lt(changeLog.id, before) : sql`true`)
    .orderBy(desc(changeLog.id))
    .limit(limit);

  const [eventList, athleteList] = await Promise.all([
    db
      .select({
        id: events.id,
        name: events.name,
        unitLabel: events.unitLabel,
        decimals: events.decimals,
      })
      .from(events),
    db.select({ id: athletes.id, name: athletes.name }).from(athletes),
  ]);
  const eventsById = new Map(eventList.map((e) => [e.id, e]));
  const eventNames = new Map(eventList.map((e) => [e.id, e.name]));
  const athleteNames = new Map(athleteList.map((a) => [a.id, a.name]));

  return rows.map((row) => {
    const state = (row.newRow ?? row.oldRow) as Record<string, unknown> | null;
    let label = row.tableName;

    if (row.tableName === "results" && state) {
      const athlete = athleteNames.get(String(state.athlete_id)) ?? "Unknown athlete";
      const event = eventNames.get(String(state.event_id)) ?? "Unknown event";
      label = `${athlete} — ${event}`;
    } else if (state && typeof state.name === "string") {
      label = state.name;
    }

    // Restoring means undoing: go back to the state before this change, or —
    // for an entry that created the row — back to the state it created.
    const restoreSource = (row.oldRow ?? row.newRow) as Record<string, unknown> | null;
    let restoreTo: string | null = null;
    if (row.tableName === "results" && restoreSource) {
      const event = eventsById.get(String(restoreSource.event_id));
      const raw = Number(restoreSource.raw_value);
      if (event && Number.isFinite(raw)) {
        restoreTo = `${formatMeasurement(raw, event.decimals)}${event.unitLabel ? ` ${event.unitLabel}` : ""}`;
      }
    }

    return {
      id: row.id,
      tableName: row.tableName,
      recordId: row.recordId,
      operation: row.operation,
      oldRow: row.oldRow as Record<string, unknown> | null,
      newRow: row.newRow as Record<string, unknown> | null,
      changedBy: row.changedBy,
      changedAt: row.changedAt,
      restoredFromId: row.restoredFromId,
      label,
      restoreTo,
    };
  });
}
