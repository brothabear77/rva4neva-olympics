import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { checkPassword } from "../src/lib/credentials";
import { hashPassword } from "../src/lib/password";

/**
 * Create a staff login, or set a new password on one that exists:
 *
 *   npm run auth:staff -- Admin
 *   npm run auth:staff -- Scorekeeper
 *   npm run auth:staff -- "Head Judge" --role=scorekeeper
 *
 * A login named "Admin" gets the admin role and anything else is a scorekeeper,
 * unless --role says otherwise. The password is asked for with typing hidden (or read
 * from STAFF_PASSWORD, for scripts). Writes to whatever DATABASE_URL points at.
 */

function ask(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"))?.trim();
  const roleArg = args.find((a) => a.startsWith("--role="))?.slice("--role=".length);
  if (!name) throw new Error('Name the login: npm run auth:staff -- Admin');

  const role = roleArg ?? (name.toLowerCase() === "admin" ? "admin" : "scorekeeper");
  if (role !== "admin" && role !== "scorekeeper") throw new Error("--role must be admin or scorekeeper.");

  let password = process.env.STAFF_PASSWORD;
  if (!password) {
    password = await ask(`Password for ${name}: `);
    const again = await ask("Again: ");
    if (again !== password) throw new Error("The two passwords don't match.");
  }
  const check = checkPassword(password);
  if (!check.ok) throw new Error(check.error);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : undefined, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    console.log(`Writing to ${url.replace(/:[^:@/]*@/, ":****@")}`);
    const passwordHash = await hashPassword(check.value);
    const [existing] = await db
      .select()
      .from(schema.accounts)
      .where(sql`lower(${schema.accounts.staffName}) = lower(${name})`)
      .limit(1);

    if (existing) {
      await db
        .update(schema.accounts)
        .set({ passwordHash, role, failedLogins: 0, lockedUntil: null })
        .where(sql`${schema.accounts.id} = ${existing.id}`);
      // A new password signs out every browser that knew the old one.
      await db.delete(schema.sessions).where(sql`${schema.sessions.accountId} = ${existing.id}`);
      console.log(`Updated ${existing.staffName} (${role}). Its sessions were signed out.`);
    } else {
      await db.insert(schema.accounts).values({ staffName: name, role, passwordHash });
      console.log(`Created ${name} (${role}).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
