import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import {
  APP_SECRET_PLACEHOLDER,
  ROOT,
  SITE_STACK,
  awsContext,
  capture,
  fail,
  flag,
  messageOf,
  run,
  step,
  stackOutputs,
} from "./aws";

/**
 * Set up the production database, and connect the app to it.
 *
 *   npm run aws:db                      create the tables, give the app its login, restart the app
 *   npm run aws:db -- --seed            also (re)load the ten events and the starting roster
 *   npm run aws:db -- --with-results    same, plus sample scores (for a demo; not for the real event)
 *
 * Safe to run again: migrations only apply what is new, the app's login and permissions are
 * re-asserted, and the seed runs by itself only when the database has no events. Run it after
 * any change that adds a migration.
 *
 * It runs from your machine, as the database owner, which is why the database allows your
 * IP address in. The app never gets those credentials: it gets a second login that can read
 * and write scores but cannot change the schema or rewrite the history.
 */

const APP_ROLE = "olympics_app";
const CA_BUNDLE = path.join(ROOT, "certs", "rds-global-bundle.pem");

interface MasterSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

const encode = encodeURIComponent;

/** A connection string. verify-full checks the certificate and the host name. */
function urlFor(user: string, password: string, host: string, port: number, database: string) {
  return `postgresql://${encode(user)}:${encode(password)}@${host}:${port}/${database}?sslmode=verify-full`;
}

/** The password already in the app's secret, if it holds a real connection string for the app role. */
function existingAppPassword(secretValue: string): string | undefined {
  if (secretValue === APP_SECRET_PLACEHOLDER) return undefined;
  try {
    const url = new URL(secretValue);
    return url.username === APP_ROLE && url.password ? decodeURIComponent(url.password) : undefined;
  } catch {
    return undefined;
  }
}

/** Connect as the owner. A paused Aurora takes about 15 seconds to wake, so be patient. */
async function connectAsOwner(master: MasterSecret): Promise<Client> {
  const client = new Client({
    host: master.host,
    port: master.port,
    user: master.username,
    password: master.password,
    database: master.dbname,
    ssl: { ca: readFileSync(CA_BUNDLE, "utf8") },
    connectionTimeoutMillis: 60_000,
  });
  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || /timeout/i.test(messageOf(error))) {
      fail(
        `Could not reach the database (${messageOf(error)}).\n\n` +
          "It only accepts connections from the app and from one admin IP address. If this\n" +
          "machine's address has changed since the last deploy, run `npm run deploy` again: it\n" +
          "detects the current address and updates the rule (or pass --admin-ip=1.2.3.4).",
      );
    }
    throw error;
  }
  return client;
}

async function main() {
  step("Checking your AWS session");
  const context = awsContext();
  console.log(`  account ${context.account}, region ${context.region}`);

  step("Looking up the deployed site");
  const outputs = stackOutputs(context, SITE_STACK);
  if (!outputs.DatabaseEndpoint) fail(`The ${SITE_STACK} stack is not deployed here yet. Run \`npm run deploy\` first.`);

  const secret = (id: string) =>
    capture("aws", ["secretsmanager", "get-secret-value", "--secret-id", id, "--query", "SecretString", "--output", "text"], {
      env: context.env,
    });
  const master = JSON.parse(secret(outputs.DatabaseMasterSecretArn)) as MasterSecret;
  const host = outputs.DatabaseEndpoint;
  const port = Number(master.port) || 5432;
  console.log(`  database ${host}`);

  // Child processes (the migrator, the seeder) connect as the owner. Node must be told to
  // trust Amazon's certificate authority before it starts, which is what NODE_EXTRA_CA_CERTS
  // does. DATABASE_SSL is cleared so a local .env cannot switch TLS off.
  const ownerEnv = {
    ...process.env,
    DATABASE_URL: urlFor(master.username, master.password, host, port, master.dbname),
    DATABASE_SSL: "",
    NODE_EXTRA_CA_CERTS: CA_BUNDLE,
  };

  step("Creating or updating the tables (this wakes the database if it is paused)");
  run("npx", ["tsx", "scripts/migrate.ts"], { cwd: ROOT, env: ownerEnv });

  const owner = await connectAsOwner(master);
  let appPassword: string;
  try {
    step("Giving the app its own login");
    const current = secret(outputs.AppDatabaseUrlSecretArn);
    appPassword = existingAppPassword(current) ?? randomBytes(24).toString("hex");
    const owned = `"${master.username}"`;
    // The password is hex, so it is safe inside a SQL string literal.
    await owner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN;
        END IF;
      END $$;
    `);
    await owner.query(`ALTER ROLE ${APP_ROLE} LOGIN PASSWORD '${appPassword}'`);
    await owner.query(`
      GRANT USAGE ON SCHEMA app TO ${APP_ROLE};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${APP_ROLE};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ${APP_ROLE};
      -- Tables added by later migrations get the same access without another run.
      ALTER DEFAULT PRIVILEGES FOR ROLE ${owned} IN SCHEMA app
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
      ALTER DEFAULT PRIVILEGES FOR ROLE ${owned} IN SCHEMA app
        GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE};

      -- History is read-only for the app. The audit triggers run as their owner, so they
      -- still record every change even though the app cannot write there itself.
      GRANT USAGE ON SCHEMA audit TO ${APP_ROLE};
      GRANT SELECT ON audit.change_log TO ${APP_ROLE};
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit.change_log FROM ${APP_ROLE};
    `);

    const check = await owner.query<{ can_write_history: boolean; can_write_scores: boolean; can_create: boolean }>(`
      SELECT
        has_table_privilege('${APP_ROLE}', 'audit.change_log', 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write_history,
        has_table_privilege('${APP_ROLE}', 'app.results', 'INSERT,UPDATE,DELETE') AS can_write_scores,
        has_schema_privilege('${APP_ROLE}', 'app', 'CREATE') AS can_create
    `);
    const { can_write_history, can_write_scores, can_create } = check.rows[0];
    if (can_write_history || can_create || !can_write_scores) {
      fail(
        `The app login's permissions are not what they should be (write scores: ${can_write_scores}, ` +
          `write history: ${can_write_history}, change schema: ${can_create}).`,
      );
    }
    console.log(`  ${APP_ROLE} can read and write scores; it cannot write history or change the schema.`);

    const { rows } = await owner.query<{ count: string }>("SELECT count(*) FROM app.events");
    const empty = Number(rows[0].count) === 0;
    if (empty || flag("seed") || flag("with-results")) {
      step(empty ? "Loading the events and starting roster (the database has none)" : "Reloading the events and roster (--seed)");
      run("npx", ["tsx", "scripts/seed.ts", ...(flag("with-results") ? ["--with-results"] : [])], { cwd: ROOT, env: ownerEnv });
    } else {
      console.log(`\n  ${rows[0].count} events already loaded; leaving the events and roster alone (use --seed to reload them).`);
    }
  } finally {
    await owner.end();
  }

  step("Saving the login where the app can read it");
  const appUrl = urlFor(APP_ROLE, appPassword, host, port, master.dbname);
  // Through a private temp file, so the password never appears in a process listing.
  const scratch = mkdtempSync(path.join(tmpdir(), "olympics-secret-"));
  try {
    const file = path.join(scratch, "secret.txt");
    writeFileSync(file, appUrl, { mode: 0o600 });
    capture(
      "aws",
      ["secretsmanager", "put-secret-value", "--secret-id", outputs.AppDatabaseUrlSecretArn, "--secret-string", `file://${file}`],
      { env: context.env },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log("  saved to Secrets Manager");

  // App Runner reads secrets when an instance starts, so the running one still has the placeholder.
  step("Restarting the app so it picks the login up");
  const { OperationId: operationId } = JSON.parse(
    capture("aws", ["apprunner", "start-deployment", "--service-arn", outputs.ServiceArn, "--output", "json"], { env: context.env }),
  ) as { OperationId: string };

  const deadline = Date.now() + 8 * 60_000;
  let status = "PENDING";
  while (Date.now() < deadline && !["SUCCEEDED", "FAILED"].includes(status) && !status.startsWith("ROLLBACK")) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const operations = JSON.parse(
      capture("aws", ["apprunner", "list-operations", "--service-arn", outputs.ServiceArn, "--output", "json"], { env: context.env }),
    ) as { OperationSummaryList: Array<{ Id: string; Status: string }> };
    status = operations.OperationSummaryList.find((operation) => operation.Id === operationId)?.Status ?? status;
    process.stdout.write(`  ${status}      \r`);
  }
  console.log();
  if (status !== "SUCCEEDED") fail(`The restart ended as ${status}. Check the App Runner console for its logs.`);

  step("Checking the live site reads the database");
  const response = await fetch(`${outputs.ServiceUrl}/leaderboard`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail(`${outputs.ServiceUrl}/leaderboard answered ${response.status}. Check the App Runner logs.`);
  console.log(`  /leaderboard answered ${response.status}`);

  console.log(`\n✓ Done. The site is at ${outputs.ServiceUrl}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
