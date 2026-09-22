import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db:up && npm run db:push && npm run db:seed`.",
    );
  }
  return url;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    // Each app instance holds up to this many connections, and there are only a
    // couple of long-lived instances, so a few is plenty. The host sets this; the
    // default is conservative if it does not.
    max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 1 : 5)),
    // Idle connections are released quickly. That is what lets Aurora Serverless v2
    // pause when nobody is using the site: it cannot pause while a connection is open.
    idleTimeoutMillis: 10_000,
    // A paused Aurora takes about 15 seconds to resume, so the first query after a quiet
    // spell has to be willing to wait that long, or the first visitor gets an error page.
    connectionTimeoutMillis: Number(
      process.env.DATABASE_CONNECT_TIMEOUT_MS ?? (process.env.NODE_ENV === "production" ? 30_000 : 10_000),
    ),
    // Aurora requires TLS. Locally (plain Postgres in Docker) it must stay off.
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
  });

  // A connection sitting idle in the pool can be closed from the server's side, and
  // Aurora does exactly that whenever it scales to zero, fails over or restarts. The
  // pool reports it as an "error" event, and an event emitter with no listener for
  // "error" throws, which surfaces as an uncaught exception. Nothing is actually wrong:
  // the pool has already discarded the dead connection and opens a fresh one on the next
  // query. Listening is what makes that a log line instead of an exception.
  pool.on("error", (error) => {
    console.warn(`An idle database connection was closed (${error.message}). A new one opens on the next query.`);
  });

  return pool;
}

// Next's dev server re-evaluates modules on every edit; without this the pool
// would be recreated until Postgres refuses new connections.
const globalForDb = globalThis as unknown as { __olympicsPool?: Pool };
const pool = globalForDb.__olympicsPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__olympicsPool = pool;

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle — same query API as `db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ActorContext {
  /** Name typed on the submit form. Recorded on every changelog row. */
  actor: string;
  /** Set when the change is part of a CSV import. */
  batchId?: string | null;
  /** Set when reapplying an earlier version, so the trigger labels it RESTORE. */
  restoreOf?: number | null;
}

/**
 * Run `fn` in a transaction tagged with who is making the change.
 *
 * The audit triggers read these settings via `current_setting(...)`, which is
 * how a changelog row learns a name without the app ever writing to the audit
 * schema itself. `set_config(..., true)` scopes them to this transaction, and
 * it is used instead of `SET LOCAL` because only `set_config` accepts a bound
 * parameter — the actor is user-supplied text.
 */
export async function withActor<T>(ctx: ActorContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor', ${ctx.actor || "anonymous"}, true)`);
    await tx.execute(sql`select set_config('app.batch_id', ${ctx.batchId ?? ""}, true)`);
    await tx.execute(
      sql`select set_config('app.restore_of', ${ctx.restoreOf == null ? "" : String(ctx.restoreOf)}, true)`,
    );
    return fn(tx);
  });
}
