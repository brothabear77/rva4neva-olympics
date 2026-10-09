import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Everything the site reads and writes. */
export const appSchema = pgSchema("app");

/** Append-only history. Written by database triggers, never by the app. */
export const auditSchema = pgSchema("audit");

/** How a result got here. `restore` marks a row rewritten from history. */
export const resultSource = appSchema.enum("result_source", ["ui", "csv", "restore"]);

export const athletes = appSchema.table(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "nick" and "Nick" are the same person — first spelling wins.
    uniqueIndex("athletes_name_lower_key").on(sql`lower(${t.name})`),
  ],
);

/**
 * An athlete's walkout song: one Spotify track (or podcast episode), with what the page
 * needs to show it so that rendering never calls Spotify.
 *
 * A table of its own, not columns on `athletes`, on purpose: every change to `athletes`
 * is recorded in the change history by a trigger, and a song is not a score — picking
 * one should not fill the history. So no audit trigger is attached here. The cost: undoing
 * an athlete's deletion from the history does not bring their song back (the row goes
 * with them, via the cascade).
 */
export const walkoutSongs = appSchema.table("walkout_songs", {
  athleteId: uuid("athlete_id")
    .primaryKey()
    .references(() => athletes.id, { onDelete: "cascade" }),
  /** What `spotifyId` names. Rows from before episodes were allowed are all tracks. */
  kind: text("kind", { enum: ["track", "episode"] }).notNull().default("track"),
  /**
   * Spotify's 22-character id for the track or episode. The column keeps its original
   * name: renaming it would break the site for the minutes between deploy and migrate.
   */
  spotifyId: text("track_id").notNull(),
  title: text("title").notNull(),
  /** A track's credited artists, joined with ", "; for an episode, its show's name. */
  artists: text("artists").notNull(),
  albumArtUrl: text("album_art_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An athlete's profile once it lives in the database: what src/content/athletes.ts
 * held before they claimed their account. Not audited, for the same reason as
 * `walkoutSongs`: a bio is not a score.
 */
export const athleteProfiles = appSchema.table("athlete_profiles", {
  athleteId: uuid("athlete_id")
    .primaryKey()
    .references(() => athletes.id, { onDelete: "cascade" }),
  tagline: text("tagline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  /** A file in public/, e.g. "/athletes/nick.jpg". Photos are not uploaded yet. */
  photo: text("photo").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- accounts ------------------------------------------------------------------
//
// None of these tables are audited: a sign-in is not a score, and the history would
// otherwise fill with sessions.

/** athlete: edits their own profile. scorekeeper: enters scores. admin: everything. */
export const accountRole = appSchema.enum("account_role", ["athlete", "scorekeeper", "admin"]);

/**
 * A login. Either an athlete's (linked to their roster row, named after it) or a staff
 * login like "Admin" or "Scorekeeper" (made by `npm run auth:staff`), never both.
 */
export const accounts = appSchema.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: accountRole("role").notNull().default("athlete"),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    staffName: text("staff_name"),
    passwordHash: text("password_hash").notNull(),
    /** Wrong passwords in a row. Reset by a good one. */
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_athlete_key").on(t.athleteId),
    uniqueIndex("accounts_staff_name_lower_key").on(sql`lower(${t.staffName})`),
    check("accounts_one_owner", sql`(${t.athleteId} is null) <> (${t.staffName} is null)`),
  ],
);

/**
 * A request to claim an athlete, waiting for the admin. The phone number is only here
 * so the admin can tell who is asking: approving creates the account and deletes this
 * row, and rejecting just deletes it, so no phone number outlives its claim.
 */
export const claimRequests = appSchema.table(
  "claim_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("claim_requests_athlete_idx").on(t.athleteId)],
);

/** A signed-in browser. The id is a hash of the cookie's token, so a leaked table can't sign anyone in. */
export const sessions = appSchema.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_account_idx").on(t.accountId)],
);

// --- the athletes' pages ---------------------------------------------------------
//
// Not audited either: a practice attempt or a vote is not a score.

/** One practice attempt at an event, logged by the athlete. Private to them (and the admin). */
export const practiceAttempts = appSchema.table(
  "practice_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** In the event's own unit, like results.raw_value. */
    rawValue: numeric("raw_value", { precision: 12, scale: 4, mode: "number" }).notNull(),
    /** The calendar day it happened, in Eastern time. */
    attemptedOn: date("attempted_on", { mode: "string" }).notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("practice_attempts_athlete_event_idx").on(t.athleteId, t.eventId, t.attemptedOn)],
);

/** A change someone proposes to the group. Open for a week, then decided by `decideProposal`. */
export const proposals = appSchema.table(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [index("proposals_closes_idx").on(t.closesAt)],
);

/** One athlete's vote on one proposal. Changing your mind rewrites the row. */
export const proposalVotes = appSchema.table(
  "proposal_votes",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    inFavor: boolean("in_favor").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.athleteId] })],
);

/**
 * A video on the Vlog page. The file itself is in S3 under `objectKey`; this row is what
 * the page lists. A row starts without `uploadedAt`: it is created when the athlete asks
 * to upload, and `uploadedAt` is set once the file is confirmed to be in the bucket, so
 * a half-finished upload never shows up in the feed. Like hearts, not audited.
 */
export const vlogVideos = appSchema.table(
  "vlog_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    /** Optional: the event the clip is about. Deleting the event keeps the video. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("vlog_videos_object_key_key").on(t.objectKey),
    index("vlog_videos_feed_idx").on(t.uploadedAt),
  ],
);

/**
 * One athlete's heart on one Vlog video. The row existing is the heart; taking it back
 * deletes the row.
 */
export const vlogHearts = appSchema.table(
  "vlog_hearts",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => vlogVideos.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.athleteId] })],
);

export const events = appSchema.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Shown after a measurement: "s", "ft", "pts", "reps". */
    unitLabel: text("unit_label").notNull().default(""),
    day: smallint("day").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The performance worth 100 points. Below benchmarkZero for timed events. */
    benchmarkStandard: numeric("benchmark_standard", { precision: 12, scale: 4, mode: "number" }).notNull(),
    /** The performance worth 0 points. */
    benchmarkZero: numeric("benchmark_zero", { precision: 12, scale: 4, mode: "number" }).notNull(),
    /** Decimal places to show and accept for this event's measurement. */
    decimals: smallint("decimals").notNull().default(2),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_slug_key").on(t.slug),
    index("events_day_order_idx").on(t.day, t.sortOrder),
  ],
);

export const importBatches = appSchema.table("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull().default(""),
  rowCount: integer("row_count").notNull().default(0),
  submittedBy: text("submitted_by").notNull().default(""),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The columns of app.results, as a function so scripts/finished.ts's local-only
 * copy (src/lib/resultsTable.ts) is declared with exactly the same ones.
 */
export const resultColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  athleteId: uuid("athlete_id")
    .notNull()
    .references(() => athletes.id, { onDelete: "cascade" }),
  /** The measurement as recorded: seconds, feet, cups, whatever the event uses. */
  rawValue: numeric("raw_value", { precision: 12, scale: 4, mode: "number" }).notNull(),
  /** Derived from rawValue and the event's benchmarks. Stored so the
   *  leaderboard is one cheap SUM, recomputed whenever benchmarks change. */
  points: integer("points").notNull(),
  notes: text("notes").notNull().default(""),
  /** Who entered it: the signed-in account's name. Older rows hold whatever was typed. */
  submittedBy: text("submitted_by").notNull().default(""),
  source: resultSource("source").notNull().default("ui"),
  batchId: uuid("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const results = appSchema.table(
  "results",
  resultColumns(),
  (t) => [
    // One score per person per event. Re-submitting updates, and the update
    // shows up in the changelog like any other edit.
    uniqueIndex("results_event_athlete_key").on(t.eventId, t.athleteId),
    index("results_event_points_idx").on(t.eventId, t.points),
    index("results_athlete_idx").on(t.athleteId),
    index("results_recent_idx").on(t.createdAt),
  ],
);

/**
 * Every insert, update and delete against app.athletes, app.events and
 * app.results lands here, written by an AFTER ... FOR EACH ROW trigger inside
 * the same transaction as the change. See drizzle/0001_audit.sql — the table is
 * declared here only so the app can read it; the app has no INSERT grant.
 */
export const changeLog = auditSchema.table(
  "change_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id"),
    /** INSERT | UPDATE | DELETE | RESTORE */
    operation: text("operation").notNull(),
    oldRow: jsonb("old_row"),
    newRow: jsonb("new_row"),
    /** The signed-in account that made the change, via `set_config('app.actor', ...)`. */
    changedBy: text("changed_by").notNull().default(""),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    batchId: uuid("batch_id"),
    /** For a RESTORE, the change_log entry whose state was reapplied. */
    restoredFromId: bigint("restored_from_id", { mode: "number" }),
  },
  (t) => [
    index("change_log_record_idx").on(t.tableName, t.recordId, t.id),
    index("change_log_recent_idx").on(t.changedAt),
  ],
);

export type Athlete = typeof athletes.$inferSelect;
export type WalkoutSongRow = typeof walkoutSongs.$inferSelect;
export type AthleteProfileRow = typeof athleteProfiles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountRole = (typeof accountRole.enumValues)[number];
export type PracticeAttempt = typeof practiceAttempts.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ClaimRequest = typeof claimRequests.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Result = typeof results.$inferSelect;
export type ChangeLogEntry = typeof changeLog.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
