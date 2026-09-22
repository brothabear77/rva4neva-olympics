import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { scoreResult } from "../src/lib/scoring";

/**
 * Seed the ten events and the roster.
 *
 * Events and athletes are upserted, so re-running is safe and never touches
 * scores that have already been submitted. Pass --with-results to also load
 * sample scores for demoing the leaderboard:
 *
 *   npm run db:seed -- --with-results
 */

const EVENTS = [
  {
    slug: "50m-swim", name: "50m Swim", day: 1, sortOrder: 1,
    unitLabel: "s", decimals: 2, benchmark1000: 35, benchmarkZero: 70,
    description: "One length, timed. Any stroke.",
  },
  {
    slug: "vertical-jump", name: "Vertical Jump", day: 1, sortOrder: 2,
    unitLabel: "in", decimals: 1, benchmark1000: 24, benchmarkZero: 6,
    description: "Standing reach, then the best of three jumps.",
  },
  {
    slug: "shuttle-run", name: "Shuttle Run", day: 1, sortOrder: 3,
    unitLabel: "s", decimals: 2, benchmark1000: 4.5, benchmarkZero: 7.5,
    description: "Five yards, turn, ten back, turn, five home. Timed.",
  },
  {
    slug: "jump-rope", name: "Jump Rope", day: 1, sortOrder: 4,
    unitLabel: "reps", decimals: 0, benchmark1000: 150, benchmarkZero: 10,
    description: "Consecutive jumps, unbroken. One minute cap.",
  },
  {
    slug: "med-ball-toss", name: "Med Ball Toss", day: 1, sortOrder: 5,
    unitLabel: "ft", decimals: 1, benchmark1000: 35, benchmarkZero: 10,
    description: "Overhead, two hands, best of three throws.",
  },
  {
    slug: "farmers-walk", name: "Farmer's Walk", day: 1, sortOrder: 6,
    unitLabel: "s", decimals: 1, benchmark1000: 20, benchmarkZero: 60,
    description: "A weight in each hand, timed over a fixed course.",
  },
  {
    slug: "stick-drop", name: "Stick Drop Game", day: 2, sortOrder: 1,
    unitLabel: "in", decimals: 1, benchmark1000: 2, benchmarkZero: 12,
    description: "Reaction time: how far the stick falls before it's caught.",
  },
  {
    slug: "100m-run", name: "100m Run", day: 2, sortOrder: 2,
    unitLabel: "s", decimals: 2, benchmark1000: 12.5, benchmarkZero: 20,
    description: "One sprint, timed.",
  },
  {
    slug: "cone-drill", name: "Cone Drill", day: 2, sortOrder: 3,
    unitLabel: "s", decimals: 2, benchmark1000: 4.2, benchmarkZero: 7,
    description: "Weave the cones, timed.",
  },
  {
    slug: "broad-jump", name: "Broad Jump", day: 2, sortOrder: 4,
    unitLabel: "ft", decimals: 1, benchmark1000: 9, benchmarkZero: 4,
    description: "Standing start, both feet, best of three jumps.",
  },
  {
    slug: "mile-run", name: "Mile Run", day: 2, sortOrder: 5,
    unitLabel: "s", decimals: 0, benchmark1000: 390, benchmarkZero: 720,
    description: "One mile, timed. Entered in seconds (6:30 = 390).",
  },
] as const;

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
  ["med-ball-toss", "Mena", 24.0], ["med-ball-toss", "Marco", 28.5],
  ["med-ball-toss", "Ahmed", 19.5],
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
            benchmark1000: sql`excluded.benchmark_1000`,
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
