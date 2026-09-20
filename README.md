# \#rva4neva Olympics

A live scoreboard for a two-day backyard olympics. Ten events, one set of
standings, and anyone can post a score from their phone.

## How scoring works

Events measure different things — seconds, feet, cups, trivia points — so each
one converts its raw measurement to a common point scale, decathlon-style. Real
decathlon uses `A × (P − B)^C`; here the curve is a straight line through two
benchmarks the organizer picks per event:

- `benchmark_1000` — the performance worth **1000 points**
- `benchmark_zero` — the performance worth **0 points**

```
points = round( 1000 × (raw − benchmark_zero) / (benchmark_1000 − benchmark_zero) )
```

Direction falls out of the math: for a sprint the 1000-point mark (5.0s) is
*below* the 0-point mark (9.0s), so the slope is negative and faster scores
higher. No "lower is better" flag exists anywhere in the code.

Points floor at 0 and are deliberately **not** capped at 1000 — beating the top
benchmark should be worth something, as in a real decathlon.

The formula lives in one place, [`src/lib/scoring.ts`](src/lib/scoring.ts), and is
used by the submit form's live preview, the CSV importer and the server, so the
number you see before submitting is the number that lands on the board.

## Anyone can submit — nothing can be lost

There are no accounts. The safety net is the database: a trigger records every
insert, update and delete against `app.results`, `app.events` and `app.athletes`
into `audit.change_log`, **inside the same transaction as the change**. A score
cannot exist without its audit row, and no code path can skip logging.

That history is append-only. `UPDATE`, `DELETE` and `TRUNCATE` on
`audit.change_log` all raise — for every role, the table owner included. Undoing
a change *appends* a new entry rather than erasing the ones after it, so the
trail stays complete even while rolling something back.

See [`drizzle/0001_audit_triggers.sql`](drizzle/0001_audit_triggers.sql).

## Running it locally

Requires Node 20.9+ and Docker (Colima works).

```bash
npm install
cp .env.example .env.local && cp .env.example .env

npm run db:up          # Postgres 17 in Docker on port 5433
npm run db:migrate     # schema + audit triggers
npm run db:seed        # ten events and the roster
# npm run db:seed -- --with-results   # ...plus sample scores to look at

npm run dev
```

| Script | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | unit tests (scoring + CSV) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:psql` | psql shell into the container |
| `npm run db:reset` | wipe the volume and rebuild from scratch |
| `npm run db:studio` | Drizzle Studio |

## CSV format

One row per score. Header spelling is forgiving — `event` / `athlete` / `value`
work as well as the full names, and an event can be named by slug or by display
name.

```csv
event_slug,athlete_name,raw_value,notes
40-yard-dash,Nick,5.42,
cornhole-shootout,Dana,11,windy
```

Uploads are previewed before anything is written: how many scores are new, which
would overwrite an existing one (and with what), who joins the roster, and what
is wrong. **Any single bad row blocks the whole import** — a half-applied
scoreboard is worse than a rejected file. The commit re-validates server-side
and runs as one transaction.

## Layout

```
src/lib/scoring.ts     the point formula — pure, unit-tested
src/lib/schema.ts      Drizzle schema for the app and audit schemas
src/lib/queries.ts     read models for the pages
src/lib/actions.ts     every write, each wrapped in withActor()
src/lib/csv.ts         parsing and import preview — pure, unit-tested
src/lib/db.ts          pooling and the withActor() transaction helper
drizzle/               migrations; 0001 is the hand-written audit layer
scripts/               migrate and seed
infra/aurora.md        provisioning and deploy runbook
```

## Deploying

Production runs on Aurora Serverless v2 PostgreSQL over a direct connection.
See [`infra/aurora.md`](infra/aurora.md) — in particular, put **RDS Proxy** in
front of the cluster and keep `DATABASE_POOL_MAX=1`, or a crowd refreshing the
leaderboard will exhaust Aurora's connections.
