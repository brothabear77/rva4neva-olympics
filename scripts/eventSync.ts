import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { EVENTS } from "../src/lib/eventCatalog";
import * as schema from "../src/lib/schema";

/**
 * Load the events from src/lib/eventCatalog.ts into a database: add any that are
 * missing, and reset existing ones (matched by slug) to the catalog's name, description,
 * day, order, decimals and scoring scale. Scores and athletes aren't touched.
 *
 * The catalog is the starting point, but the scale lives in the database because it can
 * be retuned live from the site ("Adjust scoring scale"). Syncing overwrites any such
 * retune, which is why CI only syncs automatically before kickoff.
 *
 * Shared by the local seed and the production events sync (scripts/sync-events.ts).
 */
export async function syncEvents(tx: Pick<NodePgDatabase<typeof schema>, "insert" | "execute">): Promise<number> {
  // Tag the changes in Change History, where scale changes are recorded.
  await tx.execute(sql`select set_config('app.actor', 'event catalog', true)`);
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
  return events.length;
}
