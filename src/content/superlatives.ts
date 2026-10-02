/**
 * Superlative categories ("Most Powerful", "Fastest", ...) shown below the leaderboard.
 *
 * Each category is a weighted average of points across a few events — not raw
 * measurements, so a sprinter and a swimmer can both feed "Fastest" on the same
 * scale. A weight is how much that event counts toward the category relative to
 * the others in it; it is not a percentage and doesn't need to sum to anything.
 * An athlete's score only draws on the events in the category they've actually
 * done, so showing up for 3 of 4 isn't a penalty beyond not having that 4th score.
 *
 * Every event should appear in at least one category, so nothing is silently left out
 * of every superlative — an event can count toward more than one on purpose (farmers-walk
 * feeds both Most Powerful and Most Enduring, say). If you add an event, add it to a
 * category too (the typecheck won't catch a forgotten one; there's a test that does).
 *
 *   {
 *     slug: "most-powerful",      // used as a React key; keep it stable
 *     label: "Most Powerful",     // shown on the card
 *     events: [
 *       { slug: "farmers-walk", weight: 1.5 },  // slug must match an event in src/lib/eventCatalog.ts
 *       { slug: "med-ball-toss", weight: 1.2 },
 *     ],
 *   },
 */
export interface SuperlativeCategory {
  slug: string;
  label: string;
  events: Array<{ slug: string; weight: number }>;
}

export const SUPERLATIVE_CATEGORIES: SuperlativeCategory[] = [
  // {
  //   slug: "most-powerful",
  //   label: "Most Powerful",
  //   events: [
  //     { slug: "farmers-walk", weight: 1.2 },
  //     { slug: "med-ball-toss", weight: 1.5 },
  //     { slug: "vertical-jump", weight: 1.0 },
  //     { slug: "broad-jump", weight: 1.0 },
  //   ],
  // },
  // {
  //   slug: "fastest",
  //   label: "Fastest",
  //   events: [
  //     { slug: "100m-run", weight: 1.5 },
  //     { slug: "50m-swim", weight: 1.2 },
  //     { slug: "cone-drill", weight: 1.0 }
  //   ],
  // },
  // {
  //   slug: "most-agile",
  //   label: "Most Agile",
  //   events: [
  //     { slug: "shuttle-run", weight: 1.2 },
  //     { slug: "cone-drill", weight: 1.2 },
  //     { slug: "stick-drop", weight: 0.8 },
  //   ],
  // },
  // {
  //   slug: "most-enduring",
  //   label: "Most Enduring",
  //   events: [
  //     { slug: "mile-run", weight: 1.5 },
  //     { slug: "jump-rope", weight: 0.8 },
  //     { slug: "farmers-walk", weight: 1.2 }
  //   ],
  // },
  {
    slug: "most-powerful",
    label: "Most Powerful",
    events: [
      { slug: "farmers-walk", weight: 1.0 },
      { slug: "med-ball-toss", weight: 1.0 },
      { slug: "vertical-jump", weight: 1.0 },
      { slug: "broad-jump", weight: 1.0 },
    ],
  },
  {
    slug: "fastest",
    label: "Fastest",
    events: [
      { slug: "100m-run", weight: 1.0 },
      { slug: "50m-swim", weight: 1.0 },
      { slug: "cone-drill", weight: 1.0 }
    ],
  },
  {
    slug: "most-agile",
    label: "Most Agile",
    events: [
      { slug: "shuttle-run", weight: 1.0 },
      { slug: "cone-drill", weight: 1.0 },
      { slug: "stick-drop", weight: 1.0 },
    ],
  },
  {
    slug: "most-enduring",
    label: "Most Enduring",
    events: [
      { slug: "mile-run", weight: 1.0 },
      { slug: "jump-rope", weight: 1.0 },
      { slug: "farmers-walk", weight: 1.0 }
    ],
  },
];
