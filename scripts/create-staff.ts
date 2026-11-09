import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { checkPassword, defaultUsername } from "../src/lib/credentials";
import { hashPassword } from "../src/lib/password";
import { fail, flag, messageOf, option, step } from "./aws";
import { ask, explainConnectionError, target } from "./dbTarget";

/**
 * Create a staff login, or set a new password on one that exists:
 *
 *   npm run auth:staff -- Admin
 *   npm run auth:staff -- Scorekeeper
 *   npm run auth:staff -- "Head Judge" --role=scorekeeper
 *   npm run auth:staff -- Admin --prod
 *
 * A login named "Admin" gets the admin role and anything else is a scorekeeper,
 * unless --role says otherwise. The password is asked for with typing hidden (or read
 * from STAFF_PASSWORD, for scripts).
 *
 * Without --prod it writes to whatever DATABASE_URL points at (your local Docker
 * database, from .env). With --prod it ignores DATABASE_URL and connects to the
 * deployed Aurora database the way `npm run aws:db` does: as the owner, with the
 * credentials from Secrets Manager and TLS verified against certs/. That only works
 * from the admin IP address (see infra/aws.md), and it asks before writing anything.
 */

async function main() {
  const prod = flag("prod");
  const name = process.argv
    .slice(2)
    .find((a) => !a.startsWith("--"))
    ?.trim();
  if (!name) fail("Name the login: npm run auth:staff -- Admin");

  const roleArg = option("role");
  const role = roleArg ?? (name.toLowerCase() === "admin" ? "admin" : "scorekeeper");
  if (role !== "admin" && role !== "scorekeeper") fail("--role must be admin or scorekeeper.");

  const { config, label } = target(prod);

  console.log(`\nThis will create or update the ${role} login "${name}" in:\n  ${label}\n`);
  if (prod) {
    const answer = await ask(`Type "${name}" to continue: `);
    if (answer.trim() !== name) fail("Nothing was changed.");
  }

  let password = process.env.STAFF_PASSWORD;
  if (!password) {
    password = await ask(`Password for ${name}: `, { hidden: true });
    const again = await ask("Again: ", { hidden: true });
    if (again !== password) fail("The two passwords don't match. Nothing was changed.");
  }
  const check = checkPassword(password);
  if (!check.ok) fail(`${check.error} Nothing was changed.`);

  const pool = new Pool({ ...config, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    if (prod) step("Connecting (this wakes the database if it is paused)");
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
      console.log(`\n✓ Updated ${existing.staffName} (${role}). Its sessions were signed out.`);
    } else {
      await db.insert(schema.accounts).values({ staffName: name, username: defaultUsername(name), role, passwordHash });
      console.log(`\n✓ Created ${name} (${role}).`);
    }
  } catch (error) {
    explainConnectionError(error, prod);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
