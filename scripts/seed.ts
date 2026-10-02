import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { EVENTS } from "../src/lib/eventCatalog";
import * as schema from "../src/lib/schema";
import { scoreResult } from "../src/lib/scoring";

/**
 * Seed the eleven events (src/lib/eventCatalog.ts) and the roster.
 *
 * Events and athletes are upserted, so re-running is safe and never touches
 * scores that have already been submitted. Pass --with-results to also load
 * sample scores for demoing the leaderboard:
 *
 *   npm run db:seed -- --with-results
 */

// Kept in sync with src/content/athletes.ts by hand: that file adds photos, taglines
// and bios for whoever is on the roster, but the roster itself lives here.
const ATHLETES = [
  "Nick", "Mena", "Allen", "Ashley", "David", "Marco", "Mohit", "Ahmed", "Nat", "Pam",
] as const;

/** Sample scores — only loaded with --with-results. */
const SAMPLE: Array<[string, string, number]> = [
  ["50m-swim", "Nick", 42.1], ["50m-swim", "Mena", 38.7],
  ["50m-swim", "Allen", 51.4], ["50m-swim", "Ashley", 40.2],
  ["50m-swim", "David", 36.9], ["50m-swim", "Marco", 47.8],
  ["vertical-jump", "Nick", 19.5], ["vertical-jump", "Mena", 15.0],
  ["vertical-jump", "Allen", 21.0], ["vertical-jump", "Ashley", 14.5],
  ["vertical-jump", "David", 17.0], ["vertical-jump", "Mohit", 12.5],
  ["shuttle-run", "Nick", 5.1], ["shuttle-run", "Mena", 5.6],
  ["shuttle-run", "Allen", 4.9], ["shuttle-run", "David", 5.3],
  ["shuttle-run", "Ahmed", 5.8],
  ["jump-rope", "Nick", 88], ["jump-rope", "Ashley", 104],
  ["jump-rope", "Allen", 62], ["jump-rope", "Mohit", 71],
  ["med-ball-toss", "Mena", 24.0], ["med-ball-toss", "Marco", 24.5],
  ["med-ball-toss", "Ahmed", 19.5],
  ["farmers-walk", "Nick", 320.5], ["farmers-walk", "Allen", 280.0],
  ["farmers-walk", "David", 350.2], ["farmers-walk", "Marco", 240.8],
  ["farmers-walk", "Nat", 300.0], ["farmers-walk", "Mohit", 210.5],
  ["stick-drop", "Ashley", 14], ["stick-drop", "Mena", 11],
  ["stick-drop", "Pam", 9], ["stick-drop", "Allen", 16],
  ["stick-drop", "Ahmed", 7], ["stick-drop", "Nick", 13],
  ["100m-run", "David", 13.8], ["100m-run", "Nick", 14.2],
  ["100m-run", "Allen", 13.1], ["100m-run", "Marco", 15.6],
  ["100m-run", "Nat", 14.9], ["100m-run", "Mohit", 16.3],
  ["cone-drill", "Mena", 9.1], ["cone-drill", "Ashley", 9.8],
  ["cone-drill", "Allen", 8.4], ["cone-drill", "David", 9.0],
  ["cone-drill", "Pam", 10.5], ["cone-drill", "Ahmed", 10.9],
  ["broad-jump", "Nick", 2.6], ["broad-jump", "Marco", 2.1],
  ["broad-jump", "David", 2.9], ["broad-jump", "Mohit", 1.9],
  ["broad-jump", "Nat", 2.3], ["broad-jump", "Allen", 3.0],
  ["mile-run", "David", 390], ["mile-run", "Allen", 420],
  ["mile-run", "Mena", 480], ["mile-run", "Pam", 600],
  ["mile-run", "Ahmed", 450], ["mile-run", "Marco", 540],
];

async function main() {
  const withResults = process.argv.includes("--with-results");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

  const pool = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
    max: 1,
  });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      // Tag seeded rows in the changelog so they are distinguishable from
      // scores people actually submitted.
      await tx.execute(sql`select set_config('app.actor', 'seed script', true)`);

      const events = await tx
        .insert(schema.events)
        .values(EVENTS.map((e) => ({ ...e })))
        .onConflictDoUpdate({
          target: schema.events.slug,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            unitLabel: sql`excluded.unit_label`,
            day: sql`excluded.day`,
            sortOrder: sql`excluded.sort_order`,
            benchmarkStandard: sql`excluded.benchmark_standard`,
            benchmarkZero: sql`excluded.benchmark_zero`,
            decimals: sql`excluded.decimals`,
          },
        })
        .returning();
      console.log(`Events: ${events.length}`);

      const athletes = await tx
        .insert(schema.athletes)
        .values(ATHLETES.map((name) => ({ name })))
        .onConflictDoNothing()
        .returning();
      console.log(`Athletes: ${athletes.length} new (${ATHLETES.length} in roster)`);

      if (!withResults) {
        console.log("No results loaded. Re-run with --with-results for sample scores.");
        return;
      }

      const allEvents = await tx.select().from(schema.events);
      const allAthletes = await tx.select().from(schema.athletes);
      const eventBySlug = new Map(allEvents.map((e) => [e.slug, e]));
      const athleteByName = new Map(allAthletes.map((a) => [a.name.toLowerCase(), a]));

      const rows = SAMPLE.map(([slug, name, raw]) => {
        const event = eventBySlug.get(slug);
        const athlete = athleteByName.get(name.toLowerCase());
        if (!event || !athlete) throw new Error(`Sample row references unknown ${slug}/${name}`);
        return {
          eventId: event.id,
          athleteId: athlete.id,
          rawValue: raw,
          points: scoreResult(raw, event),
          submittedBy: "seed script",
          source: "ui" as const,
        };
      });

      await tx
        .insert(schema.results)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.results.eventId, schema.results.athleteId],
          set: { rawValue: sql`excluded.raw_value`, points: sql`excluded.points` },
        });
      console.log(`Results: ${rows.length}`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
