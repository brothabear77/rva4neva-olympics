import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { syncEvents } from "./eventSync";

/**
 * Load the event catalog (src/lib/eventCatalog.ts) into the database at DATABASE_URL,
 * and nothing else. This is how production gets its events: `npm run aws:db` runs it
 * when the database has none, `npm run aws:db -- --events` runs it on purpose, and CI
 * runs it when a push before kickoff changes the catalog. See eventSync.ts.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : undefined, max: 1 });
  try {
    const count = await drizzle(pool, { schema }).transaction((tx) => syncEvents(tx));
    console.log(`Events: ${count} synced from the catalog.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
