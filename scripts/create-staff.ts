import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "../src/lib/schema";
import { checkPassword } from "../src/lib/credentials";
import { hashPassword } from "../src/lib/password";
import { ROOT, SITE_STACK, awsContext, capture, fail, flag, messageOf, option, stackOutputs, step } from "./aws";

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

const CA_BUNDLE = path.join(ROOT, "certs", "rds-global-bundle.pem");

interface MasterSecret {
  username: string;
  password: string;
  port: number;
  dbname: string;
}

/** Ask a question on the terminal. `hidden` keeps what's typed off the screen, for passwords. */
function ask(question: string, { hidden = false } = {}): Promise<string> {
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
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

/** Where to write, and how to describe it before asking. */
function target(prod: boolean): { config: PoolConfig; label: string } {
  if (!prod) {
    const url = process.env.DATABASE_URL;
    if (!url) fail("DATABASE_URL is not set (copy .env.example to .env), or pass --prod.");
    return {
      config: { connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? false : undefined },
      label: url.replace(/:[^:@/]*@/, ":****@"),
    };
  }

  step("Checking your AWS session");
  const context = awsContext();
  console.log(`  account ${context.account}, region ${context.region}`);

  step("Looking up the production database");
  const outputs = stackOutputs(context, SITE_STACK);
  if (!outputs.DatabaseEndpoint || !outputs.DatabaseMasterSecretArn) {
    fail(`The ${SITE_STACK} stack is not deployed here yet, so there is no production database.`);
  }
  const master = JSON.parse(
    capture("aws", ["secretsmanager", "get-secret-value", "--secret-id", outputs.DatabaseMasterSecretArn, "--query", "SecretString", "--output", "text"], {
      env: context.env,
    }),
  ) as MasterSecret;

  return {
    config: {
      host: outputs.DatabaseEndpoint,
      port: Number(master.port) || 5432,
      user: master.username,
      password: master.password,
      database: master.dbname,
      ssl: { ca: readFileSync(CA_BUNDLE, "utf8") },
      // A paused Aurora takes about 15 seconds to wake.
      connectionTimeoutMillis: 60_000,
    },
    label: `PRODUCTION ${outputs.DatabaseEndpoint}/${master.dbname}`,
  };
}

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
      await db.insert(schema.accounts).values({ staffName: name, role, passwordHash });
      console.log(`\n✓ Created ${name} (${role}).`);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (prod && (code === "ETIMEDOUT" || code === "ECONNREFUSED" || /timeout/i.test(messageOf(error)))) {
      fail(
        `Could not reach the database (${messageOf(error)}).\n\n` +
          "It only accepts connections from the app and from one admin IP address. If this\n" +
          "machine's address has changed since the last deploy, run `npm run deploy` again\n" +
          "(or pass --admin-ip=1.2.3.4). Nothing was changed.",
      );
    }
    if (code === "42P01") fail("The accounts table doesn't exist there yet. Run the migration first (npm run aws:db for production).");
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
