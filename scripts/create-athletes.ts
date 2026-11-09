import "dotenv/config";
import { asc, isNull, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/schema";
import { addAccount, initialPassword } from "../src/lib/athleteAccounts";
import { checkUsername, defaultUsername } from "../src/lib/credentials";
import { hashPassword } from "../src/lib/password";
import { syncOpenProposals } from "../src/lib/proposalClock";
import { fail, flag, step } from "./aws";
import { ask, explainConnectionError, target } from "./dbTarget";
import { describeDbError, isUniqueViolation } from "../src/lib/dbErrors";

/**
 * Create an account for every athlete on the roster who doesn't have one yet, so
 * nobody has to go through the sign-up form:
 *
 *   npm run auth:athletes                     your local database
 *   npm run auth:athletes -- --prod           the deployed database (asks first)
 *   npm run auth:athletes -- Nick Pam --prod  only these athletes
 *   npm run auth:athletes -- Ahmed=ahmed2     pick a username (if the usual one is taken)
 *
 * Each new account starts with their name as the username ("nick") and a simple
 * password, the name lowercase plus 1 ("nick1"),
 * printed at the end for you to hand out. These are deliberately guessable and shorter
 * than the site's 8-character rule, which only applies when someone sets a password
 * themselves, so athletes should change theirs. Only the hash is stored. Running it
 * again skips anyone who already has an account, so it never changes a password.
 *
 * Like signing up on the site, it updates the close time of open proposals (more
 * athletes means more votes to wait for).
 * Profiles aren't touched: they're in app.athlete_profiles already (drizzle/0009).
 */

async function main() {
  const prod = flag("prod");
  // "Nick" picks an athlete; "Nick=nickh" also picks their username.
  const picks = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .map((a) => {
      const [name, username] = a.split("=");
      return { name: name.trim().toLowerCase(), username: username?.trim() };
    });
  const names = picks.map((p) => p.name);
  const usernames = new Map<string, string>();
  for (const p of picks) {
    if (p.username === undefined) continue;
    const check = checkUsername(p.username);
    if (!check.ok) fail(`"${p.username}" can't be a username: ${check.error}`);
    usernames.set(p.name, check.value);
  }
  const { config, label } = target(prod);

  const pool = new Pool({ ...config, max: 1 });
  const db = drizzle(pool, { schema });
  const { accounts, athletes } = schema;

  try {
    if (prod) step("Connecting (this wakes the database if it is paused)");
    const withoutAccount = await db
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .leftJoin(accounts, eq(accounts.athleteId, athletes.id))
      .where(isNull(accounts.id))
      .orderBy(asc(athletes.name));

    let chosen = withoutAccount;
    if (names.length > 0) {
      chosen = withoutAccount.filter((a) => names.includes(a.name.toLowerCase()));
      const missing = names.filter((n) => !chosen.some((a) => a.name.toLowerCase() === n));
      if (missing.length) fail(`No athlete without an account named ${missing.join(", ")}. They may already have an account.`);
    }
    if (chosen.length === 0) {
      console.log("\nEvery athlete already has an account. Nothing to do.");
      return;
    }

    console.log(`\nThis will create ${chosen.length} athlete account(s) in:\n  ${label}\n`);
    for (const a of chosen) console.log(`  ${a.name}`);
    if (prod) {
      const answer = await ask(`\nType "create" to continue: `);
      if (answer.trim() !== "create") fail("Nothing was changed.");
    }

    const created = await Promise.all(
      chosen.map(async (athlete) => {
        const password = initialPassword(athlete.name);
        const username = usernames.get(athlete.name.toLowerCase()) ?? defaultUsername(athlete.name);
        return { athlete, username, password, passwordHash: await hashPassword(password) };
      }),
    );

    await db.transaction(async (tx) => {
      for (const c of created) {
        await addAccount(tx, { athleteId: c.athlete.id, username: c.username, passwordHash: c.passwordHash });
      }
      await syncOpenProposals(tx);
    });

    console.log(`\n✓ Created ${created.length} account(s). Username and starting password:\n`);
    const width = Math.max(...created.map((c) => c.username.length));
    for (const c of created) console.log(`  ${c.username.padEnd(width)}  ${c.password}`);
    console.log();
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Usually a username already taken: someone signed up with it, or a staff login has it.
      fail(
        `An account clashes with one that already exists: ${describeDbError(error)}\n` +
          "Nothing was changed. Pick a different username for that athlete with Name=username (e.g. Ahmed=ahmed2).",
      );
    }
    explainConnectionError(error, prod);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
