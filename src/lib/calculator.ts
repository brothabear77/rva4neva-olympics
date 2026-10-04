/**
 * Logic behind the score Calculator page: a read-only "what if" over the real
 * scoring curve. Nothing here touches the database.
 */

export interface ProjectedRank {
  rank: number;
  /** Everyone counted, including the projected total itself. */
  of: number;
}

/**
 * Where `total` would land among `others`' current totals. Points only: a projected
 * total has no per-event scores, so the leaderboard's tiebreaker (src/lib/ranking.ts)
 * can't apply — equal totals share a rank here and consume the places below.
 */
export function projectedRank(total: number, others: readonly number[]): ProjectedRank {
  const ahead = others.filter((t) => t > total).length;
  return { rank: ahead + 1, of: others.length + 1 };
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
