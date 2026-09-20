"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withActor, type Tx } from "./db";
import { athletes, changeLog, events, importBatches, results } from "./schema";
import { isScorable, scoreResult } from "./scoring";
import { buildImportPreview, parseResultsCsv, type ImportPreview } from "./csv";

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
  for (const path of ["/", "/leaderboard", "/events", "/submit", "/changelog"]) {
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
// Submitting a single result
// ---------------------------------------------------------------------------

const submitSchema = z.object({
  eventId: z.string().uuid("Pick an event"),
  athleteName: z.string().trim().min(1, "Who scored this?").max(80, "That name is too long"),
  rawValue: z
    .string()
    .trim()
    .min(1, "Enter a measurement")
    .refine((v) => Number.isFinite(Number(v)), "That measurement is not a number")
    .transform(Number)
    .refine((v) => Math.abs(v) < 1e8, "That measurement is out of range"),
  notes: z.string().trim().max(280, "Keep notes under 280 characters").default(""),
  submittedBy: z.string().trim().max(80).default(""),
});

export async function submitResult(formData: FormData): Promise<ActionResult> {
  const parsed = submitSchema.safeParse({
    eventId: formData.get("eventId"),
    athleteName: formData.get("athleteName"),
    rawValue: formData.get("rawValue"),
    notes: formData.get("notes") ?? "",
    submittedBy: formData.get("submittedBy") ?? "",
  });

  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const input = parsed.data;
  const actor = input.submittedBy || input.athleteName;

  try {
    const outcome = await withActor({ actor }, async (tx) => {
      const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).limit(1);
      if (!event) throw new Error("That event no longer exists.");
      if (!isScorable(event)) throw new Error(`${event.name} has no scoring scale set yet.`);

      const athlete = await findOrCreateAthlete(tx, input.athleteName);
      const points = scoreResult(input.rawValue, event);

      const [saved] = await tx
        .insert(results)
        .values({
          eventId: event.id,
          athleteId: athlete.id,
          rawValue: input.rawValue,
          points,
          notes: input.notes,
          submittedBy: input.submittedBy,
          source: "ui",
        })
        // Re-scoring someone updates their result rather than duplicating it.
        // The overwrite is recorded in the changelog and can be rolled back.
        .onConflictDoUpdate({
          target: [results.eventId, results.athleteId],
          set: {
            rawValue: sql`excluded.raw_value`,
            points: sql`excluded.points`,
            notes: sql`excluded.notes`,
            submittedBy: sql`excluded.submitted_by`,
            source: sql`excluded.source`,
          },
        })
        .returning();

      return { athleteName: athlete.name, eventName: event.name, points: saved.points };
    });

    revalidateScoreboard();
    return ok(
      `${outcome.athleteName} scored ${outcome.points} points in ${outcome.eventName}.`,
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
      if (entry.tableName !== "results") {
        throw new Error("Only results can be restored from here.");
      }

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
      if (!athlete) throw new Error("The athlete for that result has since been deleted.");

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
    });

    revalidateScoreboard();
    return ok(message);
  } catch (error) {
    return fail(describeError(error));
  }
}
