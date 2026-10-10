import "server-only";
import { asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import {
  accounts,
  athleteProfiles,
  athletes,
  changeLog,
  claimRequests,
  events,
  practiceAttempts,
  proposalVotes,
  proposals,
  walkoutSongs,
} from "./schema";
import { results } from "./resultsTable";
import { isMigrationPending, type WalkoutSong } from "./walkout";
import { formatMeasurement } from "./scoring";
import { rankStandings } from "./ranking";
import { mergeAthleteProfiles } from "./profiles";
import { ATHLETE_PROFILES } from "@/content/athletes";
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
  /** Tied on total points with a neighbour, but placed apart by the tiebreaker. */
  wonOnTiebreak: boolean;
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
 * Equal totals are split by the tiebreaker (src/lib/ranking.ts: best single event,
 * then second best, and so on). Only athletes with identical scores in every event
 * share a rank, and then it consumes the places below (1, 2, 2, 4).
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
        wonOnTiebreak: false,
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

  return rankStandings([...byAthlete.values()].sort((a, b) => a.athleteName.localeCompare(b.athleteName)));
}

export interface EventSummary extends Event {
  resultCount: number;
  leaderName: string | null;
  leaderPoints: number | null;
  leaderRaw: number | null;
}

/** Every athlete has a result in every event: there's nothing left to score. */
export function allScoresIn(entries: LeaderboardEntry[], eventCount: number): boolean {
  return entries.length * eventCount > 0 && entries.every((e) => e.eventsCompleted === eventCount);
}

/** Whether the games are finished: the homepage's "Games finished", and when confessions go public. */
export async function gamesFinished(): Promise<boolean> {
  const [entries, eventList] = await Promise.all([getLeaderboard(), getEventSummaries()]);
  return allScoresIn(entries, eventList.length);
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

/** Every stored score as a bare (athlete, event, value) triple, to prefill the score grid. */
export async function getResultValues() {
  return db
    .select({ athleteId: results.athleteId, eventId: results.eventId, rawValue: results.rawValue })
    .from(results);
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
  const liveResultIds = new Set(
    (await db.select({ id: results.id }).from(results)).map((r) => r.id),
  );
  const eventsById = new Map(eventList.map((e) => [e.id, e]));
  const eventNames = new Map(eventList.map((e) => [e.id, e.name]));
  const athleteNames = new Map(athleteList.map((a) => [a.id, a.name]));

  // Names of athletes who have since been deleted, from their own history. Without
  // this a removed score would read "Unknown athlete", and there would be no telling
  // whose it was when deciding what to bring back.
  const athleteHistory = await db
    .select({ recordId: changeLog.recordId, oldRow: changeLog.oldRow, newRow: changeLog.newRow })
    .from(changeLog)
    .where(eq(changeLog.tableName, "athletes"))
    .orderBy(asc(changeLog.id));
  const knownNames = new Map<string, string>();
  for (const h of athleteHistory) {
    const named = (h.newRow ?? h.oldRow) as { name?: unknown } | null;
    if (h.recordId && typeof named?.name === "string") knownNames.set(h.recordId, named.name);
  }
  for (const [id, name] of athleteNames) knownNames.set(id, name); // the current spelling wins

  return rows.map((row) => {
    const state = (row.newRow ?? row.oldRow) as Record<string, unknown> | null;
    let label = row.tableName;

    if (row.tableName === "results" && state) {
      const athlete = knownNames.get(String(state.athlete_id)) ?? "Unknown athlete";
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
      // Undoing an added score removes it, so there is only something to offer while it exists.
      const stillThere = row.operation !== "INSERT" || liveResultIds.has(row.recordId ?? "");
      if (event && Number.isFinite(raw) && stillThere) {
        restoreTo = `${formatMeasurement(raw, event.decimals)}${event.unitLabel ? ` ${event.unitLabel}` : ""}`;
      }
    }

    if (row.tableName === "athletes" && restoreSource && typeof restoreSource.name === "string") {
      // Offer Undo only when it would change something.
      const now = athleteNames.get(row.recordId ?? "");
      const wanted = restoreSource.name;
      const useful =
        row.operation === "DELETE"
          ? now === undefined // still deleted; bringing them back also brings back their scores
          : row.operation === "INSERT"
            ? now !== undefined // undoing an add removes them, so only while they are still there
            : now !== undefined && now !== wanted; // renamed since; put the name back
      if (useful) restoreTo = wanted;
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

/**
 * Every athlete's walkout song, by athlete id. Athletes without one are not in the map.
 *
 * If the table (or a column of it) is not there yet, that is a deploy in progress: CI
 * ships the new code and then runs the migration, so for a few minutes the page would
 * otherwise fail over songs alone. Showing no songs until it has run is the lesser harm.
 * Any other error is a real problem and still throws.
 */
export async function getWalkoutSongs(): Promise<Map<string, WalkoutSong>> {
  try {
    const rows = await db.select().from(walkoutSongs);
    return new Map(
      rows.map((r) => [
        r.athleteId,
        { kind: r.kind, spotifyId: r.spotifyId, title: r.title, artists: r.artists, albumArtUrl: r.albumArtUrl },
      ]),
    );
  } catch (error) {
    if (!isMigrationPending(error)) throw error;
    console.warn("app.walkout_songs is not migrated yet. Showing no walkout songs.");
    return new Map();
  }
}

/** Tolerate the minutes between a deploy and the migration that adds a table it reads. */
async function orWhileMigrating<T>(query: Promise<T>, fallback: T, table: string): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (!isMigrationPending(error)) throw error;
    console.warn(`${table} is not migrated yet.`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Profiles and accounts
// ---------------------------------------------------------------------------

/** Profiles that have moved into the database, by athlete id. */
export async function getAthleteProfiles(): Promise<Map<string, { tagline: string; bio: string; photo: string }>> {
  const rows = await orWhileMigrating(db.select().from(athleteProfiles), [], "app.athlete_profiles");
  return new Map(rows.map((r) => [r.athleteId, { tagline: r.tagline, bio: r.bio, photo: r.photo }]));
}

export interface ProfileView {
  athleteId: string;
  name: string;
  tagline: string;
  bio: string;
  photo: string;
}

/**
 * One athlete's profile as the site shows it: the database's if they have one, else
 * src/content/athletes.ts's entry. Null if they're not on the roster.
 */
export async function getProfile(athleteId: string): Promise<ProfileView | null> {
  const [athlete] = await db.select({ id: athletes.id, name: athletes.name }).from(athletes).where(eq(athletes.id, athleteId)).limit(1);
  if (!athlete) return null;

  const stored = await orWhileMigrating(
    db.select().from(athleteProfiles).where(eq(athleteProfiles.athleteId, athleteId)),
    [],
    "app.athlete_profiles",
  );
  const storedMap = new Map(stored.map((r) => [r.athleteId, { tagline: r.tagline, bio: r.bio, photo: r.photo }]));
  const profile = mergeAthleteProfiles([athlete], ATHLETE_PROFILES, storedMap).rows[0]?.profile;

  return {
    athleteId: athlete.id,
    name: athlete.name,
    tagline: profile?.tagline?.trim() ?? "",
    bio: profile?.bio?.trim() ?? "",
    photo: profile?.photo?.trim() ?? "",
  };
}

export interface LoginChoice {
  accountId: string;
  label: string;
}

/** Who can sign in: staff logins first, then athletes with an approved claim, by name. */
export async function getLoginChoices(): Promise<LoginChoice[]> {
  const rows = await orWhileMigrating(
    db
      .select({ accountId: accounts.id, staffName: accounts.staffName, athleteName: athletes.name })
      .from(accounts)
      .leftJoin(athletes, eq(athletes.id, accounts.athleteId)),
    [],
    "app.accounts",
  );
  const staff = rows.filter((r) => r.staffName).map((r) => ({ accountId: r.accountId, label: r.staffName! }));
  const athleteChoices = rows
    .filter((r) => r.athleteName)
    .map((r) => ({ accountId: r.accountId, label: r.athleteName! }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...staff.sort((a, b) => a.label.localeCompare(b.label)), ...athleteChoices];
}

/** Athletes nobody has an account for yet: the ones that can be claimed. */
export async function getUnclaimedAthletes(): Promise<Array<{ id: string; name: string }>> {
  return orWhileMigrating(
    db
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .leftJoin(accounts, eq(accounts.athleteId, athletes.id))
      .where(isNull(accounts.id))
      .orderBy(asc(athletes.name)),
    [],
    "app.accounts",
  );
}

export interface PendingClaim {
  id: string;
  athleteId: string;
  athleteName: string;
  phone: string;
  createdAt: Date;
}

/** Claims waiting for the admin, oldest first. Admin-only: the page must check before calling. */
export async function getPendingClaims(): Promise<PendingClaim[]> {
  return orWhileMigrating(
    db
      .select({
        id: claimRequests.id,
        athleteId: claimRequests.athleteId,
        athleteName: athletes.name,
        phone: claimRequests.phone,
        createdAt: claimRequests.createdAt,
      })
      .from(claimRequests)
      .innerJoin(athletes, eq(athletes.id, claimRequests.athleteId))
      .orderBy(asc(claimRequests.createdAt)),
    [],
    "app.claim_requests",
  );
}

export interface AccountRow {
  id: string;
  name: string;
  role: "athlete" | "scorekeeper" | "admin";
  isStaff: boolean;
  createdAt: Date;
}

/** Every account, staff first. Admin-only. */
export async function getAccounts(): Promise<AccountRow[]> {
  const rows = await orWhileMigrating(
    db
      .select({
        id: accounts.id,
        role: accounts.role,
        staffName: accounts.staffName,
        athleteName: athletes.name,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .leftJoin(athletes, eq(athletes.id, accounts.athleteId)),
    [],
    "app.accounts",
  );
  return rows
    .map((r) => ({
      id: r.id,
      name: r.staffName ?? r.athleteName ?? "?",
      role: r.role,
      isStaff: r.staffName !== null,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => Number(b.isStaff) - Number(a.isStaff) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// The athletes' pages
// ---------------------------------------------------------------------------

export interface PracticeAttemptRow {
  id: string;
  eventId: string;
  rawValue: number;
  attemptedOn: string;
  notes: string;
}

/** One athlete's logged attempts, newest first. */
export async function getPracticeAttempts(athleteId: string): Promise<PracticeAttemptRow[]> {
  return orWhileMigrating(
    db
      .select({
        id: practiceAttempts.id,
        eventId: practiceAttempts.eventId,
        rawValue: practiceAttempts.rawValue,
        attemptedOn: practiceAttempts.attemptedOn,
        notes: practiceAttempts.notes,
      })
      .from(practiceAttempts)
      .where(eq(practiceAttempts.athleteId, athleteId))
      .orderBy(desc(practiceAttempts.attemptedOn), desc(practiceAttempts.createdAt)),
    [],
    "app.practice_attempts",
  );
}

export interface ProposalRow {
  id: string;
  title: string;
  body: string;
  proposerId: string;
  proposerName: string;
  createdAt: Date;
  closesAt: Date;
  withdrawnAt: Date | null;
  yes: number;
  no: number;
  /** Athlete accounts that existed when voting closed (or exist now, while it is open). */
  eligible: number;
  /** The viewer's own vote: true for Yes, false for No, null if they haven't voted. */
  myVote: boolean | null;
}

/** Every proposal, newest first, with tallies and how `viewerAthleteId` voted. */
export async function getProposals(viewerAthleteId: string | null): Promise<ProposalRow[]> {
  return orWhileMigrating(
    (async () => {
      const rows = await db
        .select({
          id: proposals.id,
          title: proposals.title,
          body: proposals.body,
          proposerId: proposals.athleteId,
          proposerName: athletes.name,
          createdAt: proposals.createdAt,
          closesAt: proposals.closesAt,
          withdrawnAt: proposals.withdrawnAt,
          yes: sql<number>`(select count(*)::int from ${proposalVotes} v where v.proposal_id = ${proposals.id} and v.in_favor)`,
          no: sql<number>`(select count(*)::int from ${proposalVotes} v where v.proposal_id = ${proposals.id} and not v.in_favor)`,
          eligible: sql<number>`(select count(*)::int from ${accounts} a where a.athlete_id is not null and a.created_at <= ${proposals.closesAt})`,
        })
        .from(proposals)
        .innerJoin(athletes, eq(athletes.id, proposals.athleteId))
        .orderBy(desc(proposals.createdAt));

      const mine = viewerAthleteId
        ? await db
            .select({ proposalId: proposalVotes.proposalId, inFavor: proposalVotes.inFavor })
            .from(proposalVotes)
            .where(eq(proposalVotes.athleteId, viewerAthleteId))
        : [];
      const myVotes = new Map(mine.map((v) => [v.proposalId, v.inFavor]));
      return rows.map((r) => ({ ...r, myVote: myVotes.get(r.id) ?? null }));
    })(),
    [],
    "app.proposals",
  );
}
