import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

  const pool = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
    max: 1,
  });

  try {
    console.log(`Migrating ${url.replace(/:[^:@/]*@/, ":****@")}`);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
