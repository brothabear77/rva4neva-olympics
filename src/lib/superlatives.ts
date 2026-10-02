import type { SuperlativeCategory } from "../content/superlatives";

export type { SuperlativeCategory };

/**
 * Superlative standings: per category, every athlete's weighted-average points
 * across that category's events, from whichever of them they've actually done.
 *
 * Kept separate from queries.ts because it needs no database of its own — it's
 * a pure function of a leaderboard already loaded, so it's cheap to test and
 * cheap to recompute whenever a result changes.
 */

/** The points a leaderboard entry has in each event, by the event's slug. */
export type PointsBySlug = Record<string, number>;

export interface SuperlativeStanding {
  athleteId: string;
  athleteName: string;
  /** Weighted average of points, rounded the same way scoreResult() rounds a single event. */
  score: number;
  /** How many of the category's events this average is drawn from. */
  eventsCounted: number;
  eventsInCategory: number;
}

export interface SuperlativeResult {
  category: SuperlativeCategory;
  /** Every athlete with at least one result in the category, best score first. */
  standings: SuperlativeStanding[];
  /** The top score's holder(s) — more than one when they're tied. */
  leaders: SuperlativeStanding[];
}

/**
 * One category's standings, from each athlete's points in the events that make
 * it up. An athlete with no result in any of those events isn't ranked at all —
 * there's nothing to average — so a brand-new category can be added before
 * anyone has done its events without crowning someone at 0.
 */
function standingsFor(
  category: SuperlativeCategory,
  athletes: Array<{ athleteId: string; athleteName: string; pointsBySlug: PointsBySlug }>,
): SuperlativeStanding[] {
  const weights = category.events.filter((e) => Number.isFinite(e.weight) && e.weight > 0);

  const standings = athletes
    .map(({ athleteId, athleteName, pointsBySlug }) => {
      let weightedSum = 0;
      let weightTotal = 0;
      let eventsCounted = 0;
      for (const { slug, weight } of weights) {
        const points = pointsBySlug[slug];
        if (points === undefined) continue;
        weightedSum += weight * points;
        weightTotal += weight;
        eventsCounted += 1;
      }
      if (eventsCounted === 0) return null;
      return {
        athleteId,
        athleteName,
        score: Math.round(weightedSum / weightTotal),
        eventsCounted,
        eventsInCategory: weights.length,
      };
    })
    .filter((s): s is SuperlativeStanding => s !== null);

  return standings.sort((a, b) => b.score - a.score || a.athleteName.localeCompare(b.athleteName));
}

/** Every category's standings, each sorted best-first, with ties for the lead kept together. */
export function computeSuperlatives(
  categories: SuperlativeCategory[],
  athletes: Array<{ athleteId: string; athleteName: string; pointsBySlug: PointsBySlug }>,
): SuperlativeResult[] {
  return categories.map((category) => {
    const standings = standingsFor(category, athletes);
    const topScore = standings[0]?.score;
    const leaders = topScore === undefined ? [] : standings.filter((s) => s.score === topScore);
    return { category, standings, leaders };
  });
}

/**
 * How many categories each event slug appears in, for the test that checks every real
 * event is covered by at least one (src/content/superlatives.ts's own rule) — an event
 * is allowed to show up in more than one category on purpose.
 */
export function categorySlugCounts(categories: SuperlativeCategory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const category of categories) {
    for (const { slug } of category.events) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}
