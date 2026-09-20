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
  return new Pool({
    connectionString: connectionString(),
    // Aurora is reached over a direct connection, so every serverless instance
    // holds real backends. Keep this at 1 in production (behind RDS Proxy) and
    // let a local dev server use a few.
    max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 1 : 5)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Aurora requires TLS. Locally (plain Postgres in Docker) it must stay off.
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined,
  });
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
