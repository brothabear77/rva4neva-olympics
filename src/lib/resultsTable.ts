import { appSchema, resultColumns, results as liveResults } from "./schema";

/**
 * Which table the app reads and writes results through: app.results normally, or
 * app.results_finished — a local-only copy with every athlete scored in every
 * event — when started with `npm run dev:finished` (RESULTS_TABLE=finished).
 * That copy is built by `npm run db:finished`; see scripts/finished.ts.
 *
 * results_finished is declared here rather than in schema.ts so drizzle-kit never
 * sees it and never writes a migration for it: it must not exist in production.
 * The switch is ignored in a production build for the same reason.
 *
 * The cast: drizzle types a table by its name as well as its columns, so the copy
 * is its own type even though the columns are identical (both come from
 * resultColumns()). Every query only touches the columns, so it's sound.
 */
const finishedResults = appSchema.table("results_finished", resultColumns());

export const usingFinishedResults =
  process.env.NODE_ENV !== "production" && process.env.RESULTS_TABLE === "finished";

export const results = usingFinishedResults ? (finishedResults as unknown as typeof liveResults) : liveResults;
