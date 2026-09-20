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
    slug: "40-yard-dash", name: "40-Yard Dash", day: 1, sortOrder: 1,
    unitLabel: "s", decimals: 2, benchmark1000: 4.8, benchmarkZero: 9,
    description: "One sprint, timed. Fastest of two attempts counts.",
  },
  {
    slug: "cornhole-shootout", name: "Cornhole Shootout", day: 1, sortOrder: 2,
    unitLabel: "bags", decimals: 0, benchmark1000: 16, benchmarkZero: 2,
    description: "Twenty bags from regulation distance. Count the ones that drop.",
  },
  {
    slug: "keg-toss", name: "Keg Toss", day: 1, sortOrder: 3,
    unitLabel: "ft", decimals: 1, benchmark1000: 30, benchmarkZero: 8,
    description: "Empty keg, two hands, best of three throws.",
  },
  {
    slug: "wiffle-derby", name: "Wiffle Ball Derby", day: 1, sortOrder: 4,
    unitLabel: "HR", decimals: 0, benchmark1000: 10, benchmarkZero: 0,
    description: "Fifteen pitches. Over the fence only.",
  },
  {
    slug: "spikeball-rally", name: "Spikeball Rally", day: 1, sortOrder: 5,
    unitLabel: "touches", decimals: 0, benchmark1000: 40, benchmarkZero: 5,
    description: "Longest unbroken rally with a partner.",
  },
  {
    slug: "plank-hold", name: "Plank Hold", day: 2, sortOrder: 1,
    unitLabel: "s", decimals: 0, benchmark1000: 240, benchmarkZero: 20,
    description: "Elbows down, hips up. Timer stops when form goes.",
  },
  {
    slug: "putt-putt", name: "Putt-Putt Gauntlet", day: 2, sortOrder: 2,
    unitLabel: "strokes", decimals: 0, benchmark1000: 18, benchmarkZero: 40,
    description: "Nine holes. Fewest strokes wins, so lower scores more.",
  },
  {
    slug: "flip-cup-sprint", name: "Flip Cup Sprint", day: 2, sortOrder: 3,
    unitLabel: "s", decimals: 2, benchmark1000: 8, benchmarkZero: 30,
    description: "Six cups, solo, timed from first sip to last flip.",
  },
  {
    slug: "corn-maze-trivia", name: "Trivia Gauntlet", day: 2, sortOrder: 4,
    unitLabel: "pts", decimals: 0, benchmark1000: 45, benchmarkZero: 10,
    description: "Fifty questions, no phones, honor system.",
  },
  {
    slug: "tug-of-war-anchor", name: "Anchor Pull", day: 2, sortOrder: 5,
    unitLabel: "s", decimals: 1, benchmark1000: 45, benchmarkZero: 5,
    description: "Hold the rope against the sled. Longest hold wins.",
  },
] as const;

const ATHLETES = [
  "Nick", "Dana", "Theo", "Priya", "Marcus", "Jo", "Elena", "Sam",
] as const;

/** Sample scores — only loaded with --with-results. */
const SAMPLE: Array<[string, string, number]> = [
  ["40-yard-dash", "Nick", 5.42], ["40-yard-dash", "Dana", 5.11],
  ["40-yard-dash", "Theo", 6.03], ["40-yard-dash", "Priya", 5.28],
  ["40-yard-dash", "Marcus", 4.94], ["40-yard-dash", "Jo", 5.77],
  ["cornhole-shootout", "Nick", 11], ["cornhole-shootout", "Dana", 7],
  ["cornhole-shootout", "Theo", 14], ["cornhole-shootout", "Priya", 9],
  ["cornhole-shootout", "Marcus", 6], ["cornhole-shootout", "Elena", 12],
  ["keg-toss", "Nick", 21.5], ["keg-toss", "Dana", 17.0],
  ["keg-toss", "Theo", 26.5], ["keg-toss", "Marcus", 24.0],
  ["keg-toss", "Sam", 19.5],
  ["wiffle-derby", "Nick", 6], ["wiffle-derby", "Priya", 8],
  ["wiffle-derby", "Theo", 3], ["wiffle-derby", "Elena", 5],
  ["spikeball-rally", "Dana", 33], ["spikeball-rally", "Jo", 41],
  ["spikeball-rally", "Sam", 18],
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
