/**
 * Decathlon-style scoring.
 *
 * Real decathlon tables use `A × (P − B)^C`. We pin the exponent to 1, so the
 * curve is a straight line through two benchmarks the organizer picks per event:
 *
 *   benchmark1000 — the performance worth 1000 points
 *   benchmarkZero — the performance worth 0 points
 *
 * Direction falls out of the math. For a sprint, benchmark1000 (say 5.0s) is
 * *below* benchmarkZero (9.0s), so the slope is negative and faster scores
 * higher — no "lower is better" flag needed anywhere.
 *
 * Points are floored at 0 but deliberately NOT capped at 1000: beating the
 * top benchmark should be worth something, as in a real decathlon.
 */

export interface ScoringConfig {
  benchmark1000: number;
  benchmarkZero: number;
}

export const MAX_POINTS = 100_000;

/** True when a smaller raw measurement earns more points (times, not distances). */
export function isLowerBetter(config: ScoringConfig): boolean {
  return config.benchmark1000 < config.benchmarkZero;
}

/**
 * An event whose two benchmarks are equal has no scale — every performance
 * would be both 0 and 1000 points. Callers should reject these on save.
 */
export function isScorable(config: ScoringConfig): boolean {
  return (
    Number.isFinite(config.benchmark1000) &&
    Number.isFinite(config.benchmarkZero) &&
    config.benchmark1000 !== config.benchmarkZero
  );
}

/** Convert a raw measurement into leaderboard points. */
export function scoreResult(raw: number, config: ScoringConfig): number {
  if (!Number.isFinite(raw) || !isScorable(config)) return 0;

  const span = config.benchmark1000 - config.benchmarkZero;
  const points = (1000 * (raw - config.benchmarkZero)) / span;

  if (!Number.isFinite(points)) return 0;
  // Clamp the top too — not to cap real performances, but so a typo like an
  // extra zero can't overflow an integer column or swamp the standings.
  return Math.min(MAX_POINTS, Math.max(0, Math.round(points)));
}

/** Inverse of {@link scoreResult}: the raw measurement worth `points`. */
export function rawForPoints(points: number, config: ScoringConfig): number | null {
  if (!isScorable(config)) return null;
  const span = config.benchmark1000 - config.benchmarkZero;
  return config.benchmarkZero + (points * span) / 1000;
}

/** Trim a measurement to an event's precision, e.g. 5.126 -> "5.13". */
export function formatMeasurement(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(Math.max(0, Math.min(6, decimals)));
}

/** "1000 pts = 5.00s · 0 pts = 9.00s" */
export function describeScale(
  config: ScoringConfig,
  decimals: number,
  unitLabel: string,
): string {
  if (!isScorable(config)) return "Not yet scorable";
  const unit = unitLabel ? ` ${unitLabel}` : "";
  return `1000 pts = ${formatMeasurement(config.benchmark1000, decimals)}${unit} · 0 pts = ${formatMeasurement(config.benchmarkZero, decimals)}${unit}`;
}
