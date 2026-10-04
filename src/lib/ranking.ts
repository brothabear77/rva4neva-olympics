/**
 * Standings order: total points, then the tiebreaker from /info/scoring — whoever
 * has the most points in a single event, then the second most, and so on.
 *
 * Pure, so it can be tested without a database (see getLeaderboard in queries.ts).
 */

export interface Standing {
  totalPoints: number;
  /** Anything keyed by event whose values carry `points`. */
  byEventId: Record<string, { points: number }>;
}

/** An athlete's per-event points, best first. */
function scoresBestFirst(standing: Standing): number[] {
  return Object.values(standing.byEventId)
    .map((r) => r.points)
    .sort((a, b) => b - a);
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  // An event with no result counts as 0, so the longer list only wins on a positive score.
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Negative when `a` ranks ahead of `b`. Zero only when nothing separates them. */
export function compareStandings(a: Standing, b: Standing): number {
  return b.totalPoints - a.totalPoints || compareScores(scoresBestFirst(a), scoresBestFirst(b));
}

/**
 * Sorts best first and assigns `rank`. Athletes share a rank only when their totals
 * and every single-event score are identical — nothing left to break the tie with.
 * Shared ranks consume the places below them (1, 1, 3), the way a scoreboard reads.
 * Equal-looking entries keep their input order, so pass them name-sorted.
 *
 * `wonOnTiebreak` marks entries that tied on total points with a neighbour but were
 * separated from them by the tiebreaker.
 */
export function rankStandings<T extends Standing>(
  entries: readonly T[],
): Array<T & { rank: number; wonOnTiebreak: boolean }> {
  const sorted = [...entries].sort(compareStandings);

  return sorted.map((entry, index) => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    const sharesPlace = previous !== undefined && compareStandings(previous, entry) === 0;
    const sameTotal = (other: T | undefined) => other !== undefined && other.totalPoints === entry.totalPoints;
    const separated = (other: T | undefined) => sameTotal(other) && compareStandings(other!, entry) !== 0;

    let rank = index + 1;
    if (sharesPlace) {
      let back = index - 1;
      while (back > 0 && compareStandings(sorted[back - 1], entry) === 0) back -= 1;
      rank = back + 1;
    }
    return { ...entry, rank, wonOnTiebreak: separated(previous) || separated(next) };
  });
}

/** One athlete's side of a tie: their event scores, best first. */
export interface TieScore {
  points: number;
  eventName: string;
}

export interface TieAthlete {
  athleteId: string;
  athleteName: string;
  rank: number;
  /** Best first — the order the tiebreaker reads them in. */
  scores: TieScore[];
  /** The score position (0 = best) at which this athlete stopped being level with anyone
   *  and got their place; null if they never did and share it. */
  settledAt: number | null;
  /** The position at which this athlete's score beat the others still level with them
   *  (rather than being placed last by elimination); null otherwise. */
  highlightAt: number | null;
}

export interface TieGroup {
  totalPoints: number;
  /** Placed order, winner first. */
  athletes: TieAthlete[];
  /** How many score positions it took to put all of them in order: 1 means the best
   *  single event settled it, 2 means it went to the second best, and so on. */
  depth: number;
  /** For each athlete but the last: the score position (0 = best) that put them ahead of
   *  the next one down, or null if nothing did and they share a place. */
  decidedAt: Array<number | null>;
}

/**
 * Every set of athletes level on total points (any score above 0), with the scores that
 * split them. `entries` must already be in standings order (rankStandings' output).
 */
export function findTies<
  T extends Standing & { athleteId: string; athleteName: string; rank: number; byEventId: Record<string, { points: number; eventName: string }> },
>(entries: readonly T[]): TieGroup[] {
  const groups: TieGroup[] = [];
  let run: T[] = [];

  const flush = () => {
    if (run.length > 1 && run[0].totalPoints > 0) {
      const athletes: TieAthlete[] = run.map((e) => ({
        athleteId: e.athleteId,
        athleteName: e.athleteName,
        rank: e.rank,
        scores: Object.values(e.byEventId)
          .map((r) => ({ points: r.points, eventName: r.eventName }))
          .sort((a, b) => b.points - a.points),
        settledAt: null,
        highlightAt: null,
      }));
      const decidedAt = athletes.slice(0, -1).map((a, i) => {
        const b = athletes[i + 1];
        for (let k = 0; k < Math.max(a.scores.length, b.scores.length); k += 1) {
          if ((a.scores[k]?.points ?? 0) !== (b.scores[k]?.points ?? 0)) return k;
        }
        return null;
      });

      // Whittle the group down one score position at a time, the way the rule reads:
      // everyone still level is compared on the same position; anyone alone at their
      // score is placed, the rest carry on to the next. `cohort` stays in placed order,
      // so equal scores are always next to each other.
      let depth = 1;
      const split = (cohort: TieAthlete[], k: number) => {
        if (cohort.every((a) => k >= a.scores.length)) return; // nothing left to compare
        depth = Math.max(depth, k + 1);
        const bands: TieAthlete[][] = [];
        for (const a of cohort) {
          const last = bands[bands.length - 1];
          if (last && (last[0].scores[k]?.points ?? 0) === (a.scores[k]?.points ?? 0)) last.push(a);
          else bands.push([a]);
        }
        bands.forEach((band, i) => {
          if (band.length === 1) {
            band[0].settledAt = k;
            // The bottom band is placed by elimination; it didn't beat anyone out.
            if (i < bands.length - 1) band[0].highlightAt = k;
          } else {
            split(band, k + 1);
          }
        });
      };
      split(athletes, 0);

      groups.push({ totalPoints: run[0].totalPoints, athletes, depth, decidedAt });
    }
    run = [];
  };

  for (const entry of entries) {
    if (run.length > 0 && run[0].totalPoints !== entry.totalPoints) flush();
    run.push(entry);
  }
  flush();
  return groups;
}
