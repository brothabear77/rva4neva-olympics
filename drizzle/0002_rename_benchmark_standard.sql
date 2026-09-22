-- Score standard moves from a 0-1000 scale to a 0-100 scale.
--
-- benchmark_1000 (the mark worth top points) becomes benchmark_standard, so the
-- name doesn't bake in a number that just changed once and could again. The
-- CHECK constraint events_benchmarks_differ references this column by name and
-- Postgres updates it automatically on rename — nothing else to do there.
ALTER TABLE app.events
  RENAME COLUMN benchmark_1000 TO benchmark_standard;
--> statement-breakpoint

-- Every already-stored result was scored on the old 0-1000 scale. Rescale it to
-- 0-100 so the leaderboard's stored SUM matches what scoreResult() would compute
-- fresh — same rounding (half away from zero) and the same 100x-over-top safety
-- clamp the app now uses (MAX_POINTS = 10_000, was 100_000).
--
-- Attribute the change in the audit trail like any other write, rather than
-- leaving change_log rows attached to no one.
SELECT set_config('app.actor', 'migration: rescale points to 0-100 scale', true);
--> statement-breakpoint

UPDATE app.results
SET points = LEAST(10000, GREATEST(0, ROUND(points / 10.0)))
WHERE points <> LEAST(10000, GREATEST(0, ROUND(points / 10.0)));
