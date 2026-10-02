import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { rawForPoints, scoreResult } from "../src/lib/scoring";

/**
 * A complete set of results — every athlete in every event — for testing the pages
 * that only look right once everything is scored: the Champion on the homepage
 * (src/components/Champion.tsx), "Games Finished" (src/components/Countdown.tsx),
 * Superlatives, a full leaderboard. db:seed's own sample scores touch only a few
 * events on purpose, to keep it a believable mid-games demo.
 *
 *   npm run db:fixtures -- --seed      (re)generate app.results_fixture
 *   npm run db:fixtures -- --apply     copy it into app.results, filling gaps only
 *   npm run db:fixtures -- --revert    remove exactly what --apply added
 *
 * app.results_fixture is local-only tooling, not part of the app: no drizzle
 * migration for it, nothing here ever runs against AWS. --seed creates it itself
 * if it's missing. It keys on athlete name and event slug rather than their ids,
 * so it survives a db:reset (which gives both fresh ids) without regenerating —
 * --apply resolves names and slugs to whatever ids are current when it runs, and
 * quietly skips a fixture row whose athlete or event no longer exists.
 *
 * --apply only fills gaps: an athlete/event pair that already has a real or
 * seeded result keeps it. --apply tags every row it writes with
 * submittedBy = "fixture", and --revert deletes exactly those, however long ago
 * they were applied — it never touches a result someone actually submitted.
 */

const FIXTURE_TAG = "fixture";

async function main() {
  const seed = process.argv.includes("--seed");
  const apply = process.argv.includes("--apply");
  const revert = process.argv.includes("--revert");
  if (!seed && !apply && !revert) {
    console.log("Usage: npm run db:fixtures -- --seed | --apply | --revert");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : undefined, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    if (seed) await seedFixture(db);
    if (apply) await applyFixture(db);
    if (revert) await revertFixture(db);
  } finally {
    await pool.end();
  }
}

async function seedFixture(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`
    create table if not exists app.results_fixture (
      athlete_name text not null,
      event_slug text not null,
      raw_value numeric(12, 4) not null,
      primary key (athlete_name, event_slug)
    )
  `);

  const athletes = await db.select().from(schema.athletes);
  const events = await db.select().from(schema.events);
  if (athletes.length === 0 || events.length === 0) {
    console.log("No athletes or events yet — run db:seed first.");
    return;
  }

  // A deterministic spread (30-94 points) rather than real performances: enough
  // variety for a leaderboard and superlatives to look alive, the same every time
  // --seed runs so the fixture is easy to review in a diff.
  const sorted = [...athletes].sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted.flatMap((athlete, i) =>
    events.map((event, j) => {
      const points = 30 + ((i * 7 + j * 13) % 65);
      const raw = rawForPoints(points, event) ?? event.benchmarkZero;
      return { athleteName: athlete.name, eventSlug: event.slug, rawValue: raw };
    }),
  );

  await db.execute(sql`truncate table app.results_fixture`);
  // db.insert() needs results_fixture in the schema import; a plain multi-row
  // insert keeps this table out of src/lib/schema.ts, which is for the app's own
  // tables only.
  for (const row of rows) {
    await db.execute(
      sql`insert into app.results_fixture (athlete_name, event_slug, raw_value)
          values (${row.athleteName}, ${row.eventSlug}, ${row.rawValue})`,
    );
  }
  console.log(`app.results_fixture: ${rows.length} rows (${sorted.length} athletes x ${events.length} events)`);
}

async function applyFixture(db: ReturnType<typeof drizzle>) {
  const exists = await db.execute(sql`select to_regclass('app.results_fixture') as t`);
  if (!(exists.rows[0] as { t: string | null }).t) {
    console.log("app.results_fixture doesn't exist yet — run --seed first.");
    return;
  }

  const fixture = await db.execute(sql`select athlete_name, event_slug, raw_value from app.results_fixture`);
  const athletes = await db.select().from(schema.athletes);
  const events = await db.select().from(schema.events);
  const athleteByName = new Map(athletes.map((a) => [a.name.toLowerCase(), a]));
  const eventBySlug = new Map(events.map((e) => [e.slug, e]));

  const existing = await db.select().from(schema.results);
  const have = new Set(existing.map((r) => `${r.athleteId}:${r.eventId}`));

  let skippedStale = 0;
  const toInsert: Array<typeof schema.results.$inferInsert> = [];
  for (const row of fixture.rows as Array<{ athlete_name: string; event_slug: string; raw_value: string }>) {
    const athlete = athleteByName.get(row.athlete_name.toLowerCase());
    const event = eventBySlug.get(row.event_slug);
    if (!athlete || !event) {
      skippedStale += 1;
      continue;
    }
    if (have.has(`${athlete.id}:${event.id}`)) continue;
    const rawValue = Number(row.raw_value);
    toInsert.push({
      athleteId: athlete.id,
      eventId: event.id,
      rawValue,
      points: scoreResult(rawValue, event),
      submittedBy: FIXTURE_TAG,
      source: "ui",
    });
  }

  if (toInsert.length === 0) {
    console.log("Nothing to fill — every athlete already has every event scored.");
  } else {
    await db.execute(sql`select set_config('app.actor', 'fixtures script', true)`);
    await db.insert(schema.results).values(toInsert);
    console.log(`Filled ${toInsert.length} result${toInsert.length === 1 ? "" : "s"}.`);
  }
  if (skippedStale > 0) {
    console.log(`Skipped ${skippedStale} fixture row(s) whose athlete or event doesn't exist anymore.`);
  }
}

async function revertFixture(db: ReturnType<typeof drizzle>) {
  const removed = await db.delete(schema.results).where(sql`submitted_by = ${FIXTURE_TAG}`).returning();
  console.log(`Removed ${removed.length} fixture result${removed.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
