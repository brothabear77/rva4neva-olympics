import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { scoreResult } from "../src/lib/scoring";
import { createAthlete, initialPassword } from "../src/lib/athleteAccounts";
import { defaultUsername } from "../src/lib/credentials";
import { hashPassword } from "../src/lib/password";
import { syncEvents } from "./eventSync";

/**
 * Fill a LOCAL database: the events (src/lib/eventCatalog.ts, via eventSync.ts), and the
 * starting roster, each athlete with their account and profile. Production is never
 * seeded: it gets its events from `npm run aws:db -- --events`, and its athletes sign up
 * (see infra/aws.md). This refuses to run against anything but a local database.
 *
 * Re-running is safe: events are re-synced, athletes already there are left alone, and
 * submitted scores are never touched. Pass --with-results to also load sample scores:
 *
 *   npm run db:seed -- --with-results
 *
 * New athletes sign in with their name lowercase as both username and password + 1
 * ("nick" / "nick1"), like `npm run auth:athletes`.
 */

interface SeedAthlete {
  name: string;
  tagline: string;
  bio: string;
  /** A file in public/athletes/. */
  photo: string;
}

// The starting roster and their original profiles (the same ones drizzle/0009 moved into
// production's database). Only used for athletes the seed creates.
const ATHLETES: SeedAthlete[] = [
  { name: "Nick", photo: "/athletes/nick.jpg", tagline: "BDN", bio: "Former D1 athlete and sometimes shows he's still got it, even if it was over 3 years and 40 pounds ago." },
  { name: "Mena", photo: "/athletes/mena.png", tagline: "Me? Nah.", bio: "Biggest brain, bigger heart. Won't help him much here but we love him anyway." },
  { name: "Allen", photo: "/athletes/allen.png", tagline: "Where them kids at?", bio: "Avid pickleballer, and fan of Michael Jackson for the wrong reasons. Thankfully we're all adults here." },
  { name: "Ashley", photo: "/athletes/ashley.png", tagline: "", bio: "Small but mighty. Unfortunately maybe too small, but I wouldn't say that to her face." },
  { name: "David", photo: "/athletes/david.png", tagline: "Ah hahaha", bio: "You'd think someone who likes to play sports would be more coordinated. If you see him fighting a dog, help the dog." },
  { name: "Marco", photo: "/athletes/marco.png", tagline: "Mohit is a better athlete than David; I would still beat him at tennis", bio: `A gentleman and a scholar. Jury's still out on what he can actually do, but since he wanted to add a 5k, "not much" might be a good answer.` },
  { name: "Mohit", photo: "/athletes/mohit.png", tagline: "", bio: "More of an aesthetic than an athlete. Claims he did high jump in school, but the consensus is he didn't do it well." },
  { name: "Ahmed", photo: "/athletes/ahmed.jpg", tagline: "", bio: "The only one who got paid to play sports. Also the only one to hurt themselves in a geriatric sport. He may only need the one hamstring he's got left to compete with this group." },
  { name: "Nat", photo: "/athletes/nat.png", tagline: "", bio: "Not sure anyone is expecting much competition from her. Could pull out an upset if some H-Town or Memphis rap comes on though." },
  { name: "Pam", photo: "/athletes/pam.png", tagline: "P$", bio: "The embodiment of self-belief, and the reason we're not balancing by gender. If you've seen her gymnastics videos from the early 2000s, you'd know balance wasn't her strong suit anyway." },
];

/** Hosts that mean "this machine": the Docker database from docker-compose.yml. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db"]);

function assertLocal(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL isn't a valid connection string.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `The seed only fills a local database, and DATABASE_URL points at ${host}. ` +
        "Production gets its events from `npm run aws:db -- --events` and its athletes from sign-ups.",
    );
  }
}

/** Sample scores — only loaded with --with-results. */
const SAMPLE: Array<[string, string, number]> = [
  ["50m-swim", "Nick", 42.1], ["50m-swim", "Mena", 38.7],
  ["50m-swim", "Allen", 51.4], ["50m-swim", "Ashley", 40.2],
  ["50m-swim", "David", 36.9], ["50m-swim", "Marco", 47.8],
  ["vertical-jump", "Nick", 19.5], ["vertical-jump", "Mena", 15.0],
  ["vertical-jump", "Allen", 21.0], ["vertical-jump", "Ashley", 14.5],
  ["vertical-jump", "David", 17.0], ["vertical-jump", "Mohit", 12.5],
  ["vertical-jump", "Nat", 18],
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
  assertLocal(url);

  const pool = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
    max: 1,
  });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      console.log(`Events: ${await syncEvents(tx)}`);

      // Tag seeded rows in the changelog so they are distinguishable from
      // scores people actually submitted.
      await tx.execute(sql`select set_config('app.actor', 'seed script', true)`);

      // Every athlete needs an account (drizzle/0014), so a new one gets the same starting
      // login `npm run auth:athletes` hands out. Athletes already there are left alone.
      const existing = new Set((await tx.select({ name: schema.athletes.name }).from(schema.athletes)).map((a) => a.name.toLowerCase()));
      const added: string[] = [];
      for (const { name, tagline, bio, photo } of ATHLETES) {
        if (existing.has(name.toLowerCase())) continue;
        const { athleteId } = await createAthlete(tx, { name, username: defaultUsername(name), passwordHash: await hashPassword(initialPassword(name)) });
        await tx.update(schema.athleteProfiles).set({ tagline, bio, photo }).where(eq(schema.athleteProfiles.athleteId, athleteId));
        added.push(name);
      }
      console.log(`Athletes: ${added.length} new (${ATHLETES.length} in roster)`);
      if (added.length) console.log(`  New logins: username = name lowercase, password = name lowercase + 1 (e.g. ${defaultUsername(added[0])} / ${initialPassword(added[0])})`);

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
