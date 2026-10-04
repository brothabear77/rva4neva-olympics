import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { rawForPoints, scoreResult } from "../src/lib/scoring";

/**
 * (Re)builds app.results_finished: a copy of app.results with every athlete scored
 * in every event, for testing the pages that only look right once the games are
 * over — the Champion on the homepage, "Games finished", Superlatives, a full
 * leaderboard.
 *
 *   npm run db:finished     build (or rebuild) the table
 *   npm run dev:finished    run the site reading and writing it instead of app.results
 *
 * Real results are copied over as they are; every athlete/event pair without one
 * gets a generated score. app.results itself is never touched, so there's nothing
 * to undo — `npm run dev` goes straight back to it.
 *
 * Local-only: there is no drizzle migration for this table, so it never exists in
 * production (src/lib/resultsTable.ts). Re-run this after db:reset, after
 * re-seeding, or after a migration that changes app.results — it's dropped and
 * rebuilt from app.results each time, so it always matches.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : undefined, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    const athletes = await db.select().from(schema.athletes);
    const events = await db.select().from(schema.events);
    if (athletes.length === 0 || events.length === 0) {
      console.log("No athletes or events yet — run db:seed first.");
      return;
    }

    await db.transaction(async (tx) => {
      // LIKE copies columns, defaults and indexes (the one-score-per-athlete-per-event
      // unique index included, which upserts rely on) but not foreign keys.
      await tx.execute(sql`drop table if exists app.results_finished`);
      await tx.execute(sql`create table app.results_finished (like app.results including all)`);
      await tx.execute(sql`
        alter table app.results_finished
          add foreign key (event_id) references app.events (id) on delete cascade,
          add foreign key (athlete_id) references app.athletes (id) on delete cascade,
          add foreign key (batch_id) references app.import_batches (id) on delete set null
      `);
      await tx.execute(sql`insert into app.results_finished select * from app.results`);

      const existing = await tx.select().from(schema.results);
      const have = new Set(existing.map((r) => `${r.athleteId}:${r.eventId}`));

      // A deterministic spread (30-94 points) rather than real performances: enough
      // variety for a leaderboard and superlatives to look alive, the same every run.
      const sorted = [...athletes].sort((a, b) => a.name.localeCompare(b.name));
      const generated: Array<{ eventId: string; athleteId: string; rawValue: number; points: number; event: (typeof events)[number] }> = [];
      for (const [i, athlete] of sorted.entries()) {
        for (const [j, event] of events.entries()) {
          if (have.has(`${athlete.id}:${event.id}`)) continue;
          const rawValue = rawForPoints(30 + ((i * 7 + j * 13) % 65), event) ?? event.benchmarkZero;
          generated.push({ eventId: event.id, athleteId: athlete.id, rawValue, points: scoreResult(rawValue, event), event });
        }
      }

      // Two ties on purpose, to exercise the tiebreaker: first place (two athletes) and a
      // three-way tie just below the podium. Each athlete in a tie other than its top one
      // has their generated scores raised, spread over as many as it takes, by exactly the
      // gap, so the totals match and nobody else's place moves.
      const totals = new Map(athletes.map((a) => [a.id, 0]));
      for (const r of existing) totals.set(r.athleteId, (totals.get(r.athleteId) ?? 0) + r.points);
      for (const g of generated) totals.set(g.athleteId, (totals.get(g.athleteId) ?? 0) + g.points);
      const ranked = [...athletes].sort((a, b) => totals.get(b.id)! - totals.get(a.id)!);
      const MAX_GENERATED = 99;
      for (const [upper, lower] of [[0, 1], [3, 4], [3, 5]]) {
        const hi = ranked[upper];
        const lo = ranked[lower];
        if (!hi || !lo) continue;
        let gap = totals.get(hi.id)! - totals.get(lo.id)!;
        for (const row of generated.filter((g) => g.athleteId === lo.id)) {
          if (gap <= 0) break;
          // Largest raise this row can take that still scores exactly its new points.
          for (let add = Math.min(gap, MAX_GENERATED - row.points); add > 0; add -= 1) {
            const raw = rawForPoints(row.points + add, row.event);
            if (raw != null && scoreResult(raw, row.event) === row.points + add) {
              row.rawValue = raw;
              row.points += add;
              gap -= add;
              break;
            }
          }
        }
        if (gap > 0) console.log(`Couldn't tie ${lo.name} with ${hi.name}: ${gap} pts short.`);
      }

      // The spread can tie other pairs by accident. Nudge any such pair apart (one point
      // on one generated score of the lower athlete) so the ties above are the only ones.
      const tiedOnPurpose = new Set([0, 1, 3, 4, 5].map((i) => ranked[i]?.id));
      const seen = new Map<number, string>();
      for (const a of ranked) {
        const total = totals.get(a.id)!;
        const other = seen.get(total);
        if (other === undefined) {
          seen.set(total, a.id);
          continue;
        }
        if (tiedOnPurpose.has(a.id) && tiedOnPurpose.has(other)) continue;
        const row = generated.find((g) => g.athleteId === a.id);
        const raw = row && rawForPoints(row.points + 1, row.event);
        if (row && raw != null && scoreResult(raw, row.event) === row.points + 1) {
          row.rawValue = raw;
          row.points += 1;
        }
      }

      for (const g of generated) {
        await tx.execute(sql`
          insert into app.results_finished (event_id, athlete_id, raw_value, points, submitted_by)
          values (${g.eventId}, ${g.athleteId}, ${g.rawValue}, ${g.points}, 'generated')
        `);
      }

      console.log(
        `app.results_finished: ${existing.length} copied from app.results + ${generated.length} generated ` +
          `(${athletes.length} athletes x ${events.length} events).`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
