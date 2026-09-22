import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
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
    /** The performance worth 1000 points. Below benchmarkZero for timed events. */
    benchmark1000: numeric("benchmark_1000", { precision: 12, scale: 4, mode: "number" }).notNull(),
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

export const results = appSchema.table(
  "results",
  {
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
    /** Free-text "who is submitting this" — there are no accounts by design. */
    submittedBy: text("submitted_by").notNull().default(""),
    source: resultSource("source").notNull().default("ui"),
    batchId: uuid("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
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
    /** Whoever typed their name on the submit form, via `SET LOCAL app.actor`. */
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
export type Event = typeof events.$inferSelect;
export type Result = typeof results.$inferSelect;
export type ChangeLogEntry = typeof changeLog.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
