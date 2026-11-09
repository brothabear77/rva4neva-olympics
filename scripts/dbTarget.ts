import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import type { PoolConfig } from "pg";
import { dbErrorCode, describeDbError } from "../src/lib/dbErrors";
import { ROOT, SITE_STACK, awsContext, capture, fail, messageOf, stackOutputs, step } from "./aws";

/**
 * What the account scripts (create-staff.ts, create-athletes.ts) share: which database
 * to write to, how to ask a question on the terminal, and what to say when the
 * connection fails.
 *
 * Without --prod they write to whatever DATABASE_URL points at (your local Docker
 * database, from .env). With --prod they ignore DATABASE_URL and connect to the
 * deployed Aurora database the way `npm run aws:db` does: as the owner, with the
 * credentials from Secrets Manager and TLS verified against certs/. That only works
 * from the admin IP address (see infra/aws.md).
 */

const CA_BUNDLE = path.join(ROOT, "certs", "rds-global-bundle.pem");

interface MasterSecret {
  username: string;
  password: string;
  port: number;
  dbname: string;
}

/** Ask a question on the terminal. `hidden` keeps what's typed off the screen, for passwords. */
export function ask(question: string, { hidden = false } = {}): Promise<string> {
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
export function target(prod: boolean): { config: PoolConfig; label: string } {
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

/** Turn a database failure into advice, then stop. Never prints the query's parameters. */
export function explainConnectionError(error: unknown, prod: boolean): never {
  // The real Postgres error is under drizzle's wrapper, whose own message is the SQL and
  // its parameters (password hashes included), so that message is never printed.
  const code = dbErrorCode(error) ?? (error as { code?: string }).code;
  if (prod && (code === "ETIMEDOUT" || code === "ECONNREFUSED" || /timeout/i.test(messageOf(error)))) {
    fail(
      `Could not reach the database (${messageOf(error)}).\n\n` +
        "It only accepts connections from the app and from one admin IP address. If this\n" +
        "machine's address has changed since the last deploy, run `npm run deploy` again\n" +
        "(or pass --admin-ip=1.2.3.4). Nothing was changed.",
    );
  }
  const migrate = prod ? "Deploy first (npm run deploy), which runs the migrations" : "Run npm run db:migrate first";
  if (code === "42P01") fail(`A table this needs doesn't exist there yet. ${migrate}. Nothing was changed.`);
  if (code === "42703") fail(`A column this needs doesn't exist there yet (${describeDbError(error)}). ${migrate}. Nothing was changed.`);
  fail(`The database refused it: ${describeDbError(error)}\nNothing was changed.`);
}
