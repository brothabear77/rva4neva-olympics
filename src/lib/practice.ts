import { isLowerBetter, scoreResult, type ScoringConfig } from "./scoring";

/**
 * The best of a set of attempts at one event: the smallest value for a timed event,
 * the largest otherwise, with the points it would score on the leaderboard.
 */
export function bestAttempt<T extends { rawValue: number }>(
  attempts: readonly T[],
  config: ScoringConfig,
): { attempt: T; points: number } | null {
  if (attempts.length === 0) return null;
  const lower = isLowerBetter(config);
  const attempt = attempts.reduce((best, a) => (lower ? a.rawValue < best.rawValue : a.rawValue > best.rawValue) ? a : best);
  return { attempt, points: scoreResult(attempt.rawValue, config) };
}
