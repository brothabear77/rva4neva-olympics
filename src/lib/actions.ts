"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withActor, type Tx } from "./db";
import { athletes, changeLog, events, importBatches, results } from "./schema";
import { isScorable, scoreResult } from "./scoring";
import { buildImportPreview, parseResultsCsv, type ImportPreview } from "./csv";
import { MAX_RAW_VALUE, type GridDeletion, type GridSubmission } from "./grid";
import { checkAthleteName } from "./roster";

/**
 * Every write goes through here.
 *
 * Two rules hold throughout: writes run inside `withActor`, so the audit
 * triggers can attribute them, and anything touching more than one row runs in
 * a single transaction, so the scoreboard is never half-updated.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

/** Pages that show scores. Refreshed after any write. */
function revalidateScoreboard() {
  for (const path of ["/", "/leaderboard", "/events", "/submit", "/changelog", "/info/athletes"]) {
    revalidatePath(path);
  }
}

/** Postgres raises 23505 when a unique index is violated. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Nothing was saved.";
}

/**
 * Look up an athlete by name, case-insensitively, adding them if they are new.
 * Anyone can be entered mid-event without a roster step, which is the point of
 * a wide-open submit page.
 */
async function findOrCreateAthlete(tx: Tx, name: string) {
  const trimmed = name.trim();
  const [existing] = await tx
    .select()
    .from(athletes)
    .where(sql`lower(${athletes.name}) = lower(${trimmed})`)
    .limit(1);
  if (existing) return existing;

  const [created] = await tx.insert(athletes).values({ name: trimmed }).onConflictDoNothing().returning();
  if (created) return created;

  // Someone added the same name concurrently; take theirs.
  const [raced] = await tx
    .select()
    .from(athletes)
    .where(sql`lower(${athletes.name}) = lower(${trimmed})`)
    .limit(1);
  if (!raced) throw new Error(`Could not create athlete "${trimmed}"`);
  return raced;
}

// ---------------------------------------------------------------------------
// Saving the score grid
// ---------------------------------------------------------------------------

const gridSchema = z.object({
  submittedBy: z.string().trim().max(80).default(""),
  changes: z
    .array(
      z.object({
        athleteId: z.string().uuid(),
        athleteName: z.string().trim().min(1, "Every row needs an athlete name").max(80, "That name is too long"),
        eventId: z.string().uuid(),
        value: z
          .number()
          .finite("That measurement is not a number")
          .refine((v) => Math.abs(v) < MAX_RAW_VALUE, "That measurement is out of range"),
      }),
    )
    .min(1, "There is nothing to save.")
    .max(2000, "That is too many changes at once."),
});

/**
 * Apply every changed cell of the grid in one transaction.
 *
 * All or nothing, like the CSV import: a half-saved sheet would leave the
 * scoreboard showing some of a scorekeeper's entries and not others, with no
 * hint which. Points are computed here from the event's own scale rather than
 * trusted from the browser.
 *
 * Every change is a score to write, replacing any existing one for that athlete
 * and event. This never removes anything: blank cells are not sent, and there is
 * no way to ask for a deletion here (that lives on each event's page, where it
 * asks first). Notes on an existing score are left as they are — the grid has no
 * notes column, and overwriting them with blanks would lose them.
 */
export async function submitGrid(input: GridSubmission): Promise<ActionResult<{ saved: number }>> {
  const parsed = gridSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the grid and try again.");
  const { changes, submittedBy } = parsed.data;
  const actor = submittedBy || "anonymous";

  try {
    const outcome = await withActor({ actor }, async (tx) => {
      const eventRows = await tx
        .select()
        .from(events)
        .where(inArray(events.id, [...new Set(changes.map((c) => c.eventId))]));
      const eventById = new Map(eventRows.map((e) => [e.id, e]));

      // One lookup per athlete, however many cells they have.
      const athleteById = new Map<string, { id: string; name: string }>();
      const resolveAthlete = async (change: (typeof changes)[number]) => {
        const cached = athleteById.get(change.athleteId);
        if (cached) return cached;

        const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, change.athleteId)).limit(1);
        if (!athlete) throw new Error(`${change.athleteName} is no longer on the roster. Reload the page and try again.`);
        athleteById.set(athlete.id, athlete);
        return athlete;
      };

      let saved = 0;

      for (const change of changes) {
        const event = eventById.get(change.eventId);
        if (!event) throw new Error("An event in this grid no longer exists. Reload the page and try again.");

        if (!isScorable(event)) throw new Error(`${event.name} has no scoring scale set yet.`);
        const athlete = await resolveAthlete(change);

        await tx
          .insert(results)
          .values({
            eventId: event.id,
            athleteId: athlete.id,
            rawValue: change.value,
            points: scoreResult(change.value, event),
            submittedBy,
            source: "ui",
          })
          .onConflictDoUpdate({
            target: [results.eventId, results.athleteId],
            set: {
              rawValue: sql`excluded.raw_value`,
              points: sql`excluded.points`,
              submittedBy: sql`excluded.submitted_by`,
              source: sql`excluded.source`,
            },
          });
        saved += 1;
      }

      return { saved };
    });

    revalidateScoreboard();
    return ok(`Saved ${outcome.saved} score${outcome.saved === 1 ? "" : "s"}.`, outcome);
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Deleting scores from the grid
// ---------------------------------------------------------------------------

const gridDeleteSchema = z.object({
  submittedBy: z.string().trim().max(80).default(""),
  cells: z
    .array(z.object({ athleteId: z.string().uuid(), eventId: z.string().uuid() }))
    .min(1, "There is nothing to delete.")
    .max(2000, "That is too many deletions at once."),
});

/**
 * Delete the scores in the emptied cells of the grid, all together or not at all.
 *
 * This is a separate action from `submitGrid` on purpose. Saving scores can add
 * or replace but has no way to remove anything, whatever a browser sends it, so
 * the everyday path cannot lose a score by accident. Deleting only happens here,
 * from the grid's delete mode.
 *
 * Nothing is lost for good: the delete trigger records the whole row in the
 * change history, and "Undo" there puts it back. A score that is already gone
 * (someone else deleted it first) is simply skipped.
 */
export async function deleteScores(input: GridDeletion): Promise<ActionResult<{ deleted: number }>> {
  const parsed = gridDeleteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the grid and try again.");
  const { cells, submittedBy } = parsed.data;

  try {
    const outcome = await withActor({ actor: submittedBy || "anonymous" }, async (tx) => {
      let deleted = 0;
      for (const cell of cells) {
        const gone = await tx
          .delete(results)
          .where(and(eq(results.eventId, cell.eventId), eq(results.athleteId, cell.athleteId)))
          .returning({ id: results.id });
        deleted += gone.length;
      }
      return { deleted };
    });

    revalidateScoreboard();
    return ok(
      outcome.deleted === 0
        ? "Those scores were already gone."
        : `Deleted ${outcome.deleted} score${outcome.deleted === 1 ? "" : "s"}. They can be brought back from Change History.`,
      outcome,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Managing the roster
// ---------------------------------------------------------------------------

const rosterActor = z.string().trim().max(80).default("");

/** The roster as the name rules need to see it, read inside the transaction. */
const currentRoster = (tx: Tx) => tx.select({ id: athletes.id, name: athletes.name }).from(athletes);

export async function addAthlete(input: { name: string; submittedBy: string }): Promise<ActionResult> {
  const parsed = z.object({ name: z.string(), submittedBy: rosterActor }).safeParse(input);
  if (!parsed.success) return fail("Enter a name.");

  try {
    const added = await withActor({ actor: parsed.data.submittedBy || "anonymous" }, async (tx) => {
      const check = checkAthleteName(parsed.data.name, await currentRoster(tx));
      if (!check.ok) throw new Error(check.error);
      const [row] = await tx.insert(athletes).values({ name: check.name }).returning();
      return row;
    });

    revalidateScoreboard();
    return ok(`Added ${added.name} to the roster.`);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Someone with that name is already on the roster.");
    return fail(describeError(error));
  }
}

export async function renameAthlete(input: { id: string; name: string; submittedBy: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.string().uuid(), name: z.string(), submittedBy: rosterActor }).safeParse(input);
  if (!parsed.success) return fail("Check the name and try again.");

  try {
    const message = await withActor({ actor: parsed.data.submittedBy || "anonymous" }, async (tx) => {
      const [current] = await tx.select().from(athletes).where(eq(athletes.id, parsed.data.id)).limit(1);
      if (!current) throw new Error("That athlete is no longer on the roster. Reload the page.");

      // The athlete's own id is excluded so they do not clash with themselves,
      // which is also what lets a rename change only the capitalisation.
      const check = checkAthleteName(parsed.data.name, await currentRoster(tx), current.id);
      if (!check.ok) throw new Error(check.error);
      if (check.name === current.name) throw new Error("That is already their name.");

      await tx.update(athletes).set({ name: check.name }).where(eq(athletes.id, current.id));
      return `Renamed ${current.name} to ${check.name}.`;
    });

    revalidateScoreboard();
    return ok(message);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Someone with that name is already on the roster.");
    return fail(describeError(error));
  }
}

/**
 * Remove an athlete. Their scores go with them, since a score belongs to a
 * person (the foreign key cascades).
 *
 * Nothing is lost for good. The database records the athlete's deletion and each
 * score's deletion in one transaction, and "Undo" on the athlete's entry in Change
 * History brings back the athlete and every score removed with them.
 */
export async function deleteAthlete(input: { id: string; submittedBy: string }): Promise<ActionResult<{ scores: number }>> {
  const parsed = z.object({ id: z.string().uuid(), submittedBy: rosterActor }).safeParse(input);
  if (!parsed.success) return fail("Pick an athlete to delete.");

  try {
    const outcome = await withActor({ actor: parsed.data.submittedBy || "anonymous" }, async (tx) => {
      const [current] = await tx.select().from(athletes).where(eq(athletes.id, parsed.data.id)).limit(1);
      if (!current) throw new Error("That athlete was already removed.");

      const [{ scores }] = await tx
        .select({ scores: sql<number>`count(*)::int` })
        .from(results)
        .where(eq(results.athleteId, current.id));

      await tx.delete(athletes).where(eq(athletes.id, current.id));
      return { name: current.name, scores };
    });

    revalidateScoreboard();
    return ok(
      `Deleted ${outcome.name}${outcome.scores ? ` and their ${outcome.scores} score${outcome.scores === 1 ? "" : "s"}` : ""}. ` +
        "This can be undone from Change History.",
      { scores: outcome.scores },
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Deleting a result
// ---------------------------------------------------------------------------

export async function deleteResult(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("resultId") ?? "");
  const actor = String(formData.get("submittedBy") ?? "").trim() || "anonymous";
  if (!id) return fail("Missing result id.");

  try {
    const removed = await withActor({ actor }, async (tx) => {
      const [row] = await tx.delete(results).where(eq(results.id, id)).returning();
      if (!row) throw new Error("That result was already removed.");
      return row;
    });

    revalidateScoreboard();
    return ok(`Removed a ${removed.points}-point result. It can be restored from the change history.`);
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Editing an event's scoring scale
// ---------------------------------------------------------------------------

const benchmarkSchema = z
  .object({
    eventId: z.string().uuid(),
    benchmark1000: z.coerce.number().finite("Enter a number"),
    benchmarkZero: z.coerce.number().finite("Enter a number"),
    decimals: z.coerce.number().int().min(0).max(4),
    submittedBy: z.string().trim().max(80).default(""),
  })
  .refine((v) => v.benchmark1000 !== v.benchmarkZero, {
    message: "The two benchmarks must differ — otherwise the event has no scale.",
    path: ["benchmark1000"],
  });

/**
 * Change an event's scale and rescore every result already recorded for it.
 *
 * Points are stored per result so the leaderboard stays a single SUM, which
 * means the stored values go stale the moment a benchmark moves. Recomputing
 * here — in the same transaction, through the same `scoreResult` the submit
 * form uses — is what keeps them honest. Each rescored row is logged.
 */
export async function updateEventBenchmarks(formData: FormData): Promise<ActionResult> {
  const parsed = benchmarkSchema.safeParse({
    eventId: formData.get("eventId"),
    benchmark1000: formData.get("benchmark1000"),
    benchmarkZero: formData.get("benchmarkZero"),
    decimals: formData.get("decimals"),
    submittedBy: formData.get("submittedBy") ?? "",
  });

  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values and try again.");
  const input = parsed.data;
  const actor = input.submittedBy || "anonymous";

  try {
    const rescored = await withActor({ actor }, async (tx) => {
      const [event] = await tx
        .update(events)
        .set({
          benchmark1000: input.benchmark1000,
          benchmarkZero: input.benchmarkZero,
          decimals: input.decimals,
        })
        .where(eq(events.id, input.eventId))
        .returning();
      if (!event) throw new Error("That event no longer exists.");

      const affected = await tx.select().from(results).where(eq(results.eventId, event.id));
      let changed = 0;
      for (const row of affected) {
        const points = scoreResult(row.rawValue, event);
        if (points === row.points) continue;
        await tx.update(results).set({ points }).where(eq(results.id, row.id));
        changed += 1;
      }
      return { eventName: event.name, changed, total: affected.length };
    });

    revalidateScoreboard();
    return ok(
      rescored.total === 0
        ? `Updated the scale for ${rescored.eventName}.`
        : `Updated ${rescored.eventName} and rescored ${rescored.changed} of ${rescored.total} results.`,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

async function currentImportContext() {
  const [eventList, athleteList, resultList] = await Promise.all([
    db.select().from(events),
    db.select({ id: athletes.id, name: athletes.name }).from(athletes),
    db
      .select({
        eventId: results.eventId,
        athleteId: results.athleteId,
        rawValue: results.rawValue,
        points: results.points,
      })
      .from(results),
  ]);
  return { eventList, athleteList, resultList };
}

/** Parse and validate an upload without writing anything. */
export async function previewImport(csvText: string): Promise<ActionResult<ImportPreview>> {
  try {
    const { eventList, athleteList, resultList } = await currentImportContext();
    const preview = buildImportPreview(parseResultsCsv(csvText), eventList, athleteList, resultList);
    return ok(
      preview.canCommit
        ? "File looks good."
        : "This file has problems that need fixing before it can be imported.",
      preview,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/**
 * Apply an upload.
 *
 * The file is re-validated here rather than trusting the preview the browser
 * is holding: the scoreboard may have moved on since it was generated, and the
 * preview round-trips through the client.
 */
export async function commitImport(
  csvText: string,
  filename: string,
  submittedBy: string,
): Promise<ActionResult<{ created: number; updated: number; unchanged: number }>> {
  const actor = submittedBy.trim() || "csv upload";

  try {
    const { eventList, athleteList, resultList } = await currentImportContext();
    const preview = buildImportPreview(parseResultsCsv(csvText), eventList, athleteList, resultList);

    if (!preview.canCommit) {
      const first = preview.rows.find((r) => r.error);
      return fail(
        first
          ? `Nothing was imported — line ${first.line}: ${first.error}`
          : "Nothing was imported — the file could not be validated.",
      );
    }

    const applied = preview.rows.filter((r) => r.action === "create" || r.action === "update");
    if (applied.length === 0) {
      return ok("Every row already matches what is on the scoreboard. Nothing to change.", {
        created: 0,
        updated: 0,
        unchanged: preview.counts.unchanged,
      });
    }

    const batchId = crypto.randomUUID();

    await withActor({ actor, batchId }, async (tx) => {
      await tx.insert(importBatches).values({
        id: batchId,
        filename: filename.slice(0, 200),
        rowCount: applied.length,
        submittedBy: actor,
      });

      // Resolve every athlete first so the insert below is a single statement.
      const athleteIds = new Map<string, string>();
      for (const row of applied) {
        const key = row.athleteName.toLowerCase();
        if (athleteIds.has(key)) continue;
        const athlete = await findOrCreateAthlete(tx, row.athleteName);
        athleteIds.set(key, athlete.id);
      }

      await tx
        .insert(results)
        .values(
          applied.map((row) => ({
            eventId: row.eventId!,
            athleteId: athleteIds.get(row.athleteName.toLowerCase())!,
            rawValue: row.rawValue!,
            points: row.points!,
            notes: row.notes ?? "",
            submittedBy: actor,
            source: "csv" as const,
            batchId,
          })),
        )
        .onConflictDoUpdate({
          target: [results.eventId, results.athleteId],
          set: {
            rawValue: sql`excluded.raw_value`,
            points: sql`excluded.points`,
            notes: sql`excluded.notes`,
            submittedBy: sql`excluded.submitted_by`,
            source: sql`excluded.source`,
            batchId: sql`excluded.batch_id`,
          },
        });
    });

    revalidateScoreboard();
    return ok(
      `Imported ${preview.counts.create} new and ${preview.counts.update} updated result${
        preview.counts.create + preview.counts.update === 1 ? "" : "s"
      }.`,
      {
        created: preview.counts.create,
        updated: preview.counts.update,
        unchanged: preview.counts.unchanged,
      },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("Nothing was imported — the file conflicts with itself on at least one row.");
    }
    return fail(describeError(error));
  }
}

// ---------------------------------------------------------------------------
// Restoring a past version
// ---------------------------------------------------------------------------

type AuditEntry = typeof changeLog.$inferSelect;

/** Put a result back under its original id, or overwrite it if one is there now. */
async function restoreResult(tx: Tx, entry: AuditEntry): Promise<string> {
  // Restoring undoes: go back to the state the row held *before* this
  // change. For an entry that created the row there is no before, so the
  // created state is what gets put back — which is what makes restoring a
  // deleted result work.
  const target = (entry.oldRow ?? entry.newRow) as Record<string, unknown> | null;
  if (!target) throw new Error("That entry has no recorded state to restore.");

  const recordId = entry.recordId ?? String(target.id ?? "");
  if (!recordId) throw new Error("That entry has no record to restore.");

  const [event] = await tx
    .select()
    .from(events)
    .where(eq(events.id, String(target.event_id)))
    .limit(1);
  if (!event) throw new Error("The event for that result has since been deleted.");

  const rawValue = Number(target.raw_value);
  // Rescore rather than trusting the stored points: the event's scale may
  // have been retuned since this version was recorded.
  const points = scoreResult(rawValue, event);

  const [existing] = await tx.select().from(results).where(eq(results.id, recordId)).limit(1);

  if (existing) {
    await tx
      .update(results)
      .set({
        rawValue,
        points,
        notes: String(target.notes ?? ""),
        submittedBy: String(target.submitted_by ?? ""),
        source: "restore",
      })
      .where(eq(results.id, recordId));
    return `Restored ${event.name} to ${rawValue} (${points} points).`;
  }

  // The result was deleted. Put it back under its original id so its own
  // history stays attached to it.
  const [athlete] = await tx
    .select()
    .from(athletes)
    .where(eq(athletes.id, String(target.athlete_id)))
    .limit(1);
  if (!athlete) {
    throw new Error("The athlete for that result has been deleted. Undo the athlete's deletion first, which brings their scores back too.");
  }

  await tx
    .insert(results)
    .values({
      id: recordId,
      eventId: event.id,
      athleteId: athlete.id,
      rawValue,
      points,
      notes: String(target.notes ?? ""),
      submittedBy: String(target.submitted_by ?? ""),
      source: "restore",
    })
    .onConflictDoUpdate({
      target: [results.eventId, results.athleteId],
      set: { rawValue: sql`excluded.raw_value`, points: sql`excluded.points`, source: sql`excluded.source` },
    });

  return `Restored ${athlete.name}'s ${event.name} result (${points} points).`;
}

/**
 * Put an athlete back: rename them to the name an entry recorded, or, if they
 * have been deleted, bring them back under their original id.
 *
 * Deleting an athlete deletes their scores in the same transaction, so undoing
 * that deletion also brings back every score removed with them. The scores are
 * found by their entries in the history: same transaction (so the same
 * timestamp) and belonging to this athlete.
 */
async function restoreAthlete(tx: Tx, entry: AuditEntry): Promise<string> {
  const target = (entry.oldRow ?? entry.newRow) as Record<string, unknown> | null;
  const athleteId = entry.recordId ?? String(target?.id ?? "");
  const name = String(target?.name ?? "").trim();
  if (!athleteId || !name) throw new Error("That entry has no athlete to restore.");

  // The name may have been taken by someone else since.
  const [clash] = await tx
    .select()
    .from(athletes)
    .where(and(sql`lower(${athletes.name}) = lower(${name})`, ne(athletes.id, athleteId)))
    .limit(1);
  if (clash) {
    throw new Error(`${clash.name} is already on the roster, so this can't be restored as ${name}. Rename ${clash.name} first.`);
  }

  const [existing] = await tx.select().from(athletes).where(eq(athletes.id, athleteId)).limit(1);
  if (existing) {
    if (existing.name === name) return `${name} already has that name.`;
    await tx.update(athletes).set({ name }).where(eq(athletes.id, athleteId));
    return `Renamed ${existing.name} to ${name}.`;
  }

  await tx.insert(athletes).values({ id: athleteId, name });

  let scoresBack = 0;
  if (entry.operation === "DELETE") {
    const removedWithThem = await tx
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.tableName, "results"),
          eq(changeLog.operation, "DELETE"),
          // Compared in the database: a JS Date only holds milliseconds, and would
          // miss a timestamp that has microseconds.
          sql`${changeLog.changedAt} = (select changed_at from audit.change_log where id = ${entry.id})`,
          sql`${changeLog.oldRow} ->> 'athlete_id' = ${athleteId}`,
        ),
      );

    for (const removed of removedWithThem) {
      const row = removed.oldRow as Record<string, unknown> | null;
      if (!row) continue;

      const [event] = await tx.select().from(events).where(eq(events.id, String(row.event_id))).limit(1);
      if (!event) continue; // the event itself is gone; nothing to attach the score to

      const rawValue = Number(row.raw_value);
      await tx
        .insert(results)
        .values({
          id: String(row.id),
          eventId: event.id,
          athleteId,
          rawValue,
          points: scoreResult(rawValue, event),
          notes: String(row.notes ?? ""),
          submittedBy: String(row.submitted_by ?? ""),
          source: "restore",
        })
        .onConflictDoNothing();
      scoresBack += 1;
    }
  }

  return scoresBack > 0
    ? `Brought back ${name} and ${scoresBack} score${scoresBack === 1 ? "" : "s"}.`
    : `Brought back ${name}.`;
}

/**
 * Put a record back into the state a changelog entry recorded.
 *
 * History is never rewritten to do this: the restore is an ordinary write, so
 * the audit trigger appends a *new* entry labelled RESTORE that points back at
 * the one it came from. Restoring a restore, or undoing one, therefore works
 * exactly like any other change.
 */
export async function restoreChange(formData: FormData): Promise<ActionResult> {
  const entryId = Number(formData.get("entryId"));
  const actor = String(formData.get("submittedBy") ?? "").trim() || "anonymous";
  if (!Number.isFinite(entryId)) return fail("Missing change id.");

  try {
    const message = await withActor({ actor, restoreOf: entryId }, async (tx) => {
      const [entry] = await tx.select().from(changeLog).where(eq(changeLog.id, entryId)).limit(1);
      if (!entry) throw new Error("That change is not in the history.");

      if (entry.tableName === "results") return restoreResult(tx, entry);
      if (entry.tableName === "athletes") return restoreAthlete(tx, entry);
      throw new Error("Only scores and athletes can be restored from here.");
    });

    revalidateScoreboard();
    return ok(message);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("That name is already taken by someone else on the roster.");
    return fail(describeError(error));
  }
}
