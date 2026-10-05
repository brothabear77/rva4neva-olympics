/**
 * The eleven events, and the benchmarks that turn a raw measurement into points (see
 * scoring.ts). The canonical list: scripts/seed.ts upserts these into the database,
 * and anything that needs to know the real event slugs without a database connection
 * (superlatives.ts's own test) reads them from here too.
 *
 * Not to be confused with src/content/events.ts, the hand-written event *guide*
 * (rules, demo videos) keyed by the same slugs — that one is editorial content; this
 * one is the structural data the database is seeded from.
 *
 * Changing a benchmark here and re-seeding only takes effect for new scores — anyone
 * already submitted keeps the points they were given. Use the Info -> Scoring page's
 * "Retune" form instead to rescore existing results against a new scale.
 */
export const EVENTS = [
  {
    slug: "50m-swim", name: "50m Swim", day: 1, sortOrder: 1,
    unitLabel: "s", decimals: 2, benchmarkStandard: 25, benchmarkZero: 75,
    description: "Swim 50m freestyle",
  },
  {
    slug: "vertical-jump", name: "Vertical Jump", day: 1, sortOrder: 2,
    unitLabel: "in", decimals: 0, benchmarkStandard: 36, benchmarkZero: 0,
    description: "Vertical jump for height",
  },
  {
    slug: "shuttle-run", name: "Shuttle Run", day: 1, sortOrder: 3,
    unitLabel: "s", decimals: 2, benchmarkStandard: 4.5, benchmarkZero: 9,
    description: "5 yards, then 10 the other way, then 5 back to finish",
  },
  {
    slug: "jump-rope", name: "Jump Rope", day: 1, sortOrder: 4,
    unitLabel: "reps", decimals: 0, benchmarkStandard: 120, benchmarkZero: 0,
    description: "Jump rope for as many reps as possible in 30 seconds",
  },
  {
    slug: "med-ball-toss", name: "Med Ball Toss", day: 1, sortOrder: 5,
    unitLabel: "m", decimals: 2, benchmarkStandard: 25, benchmarkZero: 0,
    description: "Throw a medicine ball as far as possible",
  },
  {
    slug: "farmers-walk", name: "Farmer's Walk", day: 1, sortOrder: 6,
    unitLabel: "m", decimals: 2, benchmarkStandard: 400, benchmarkZero: 0,
    description: "Farmers walk",
  },
  {
    slug: "stick-drop", name: "Stick Drop Game", day: 2, sortOrder: 1,
    unitLabel: "sticks", decimals: 0, benchmarkStandard: 18, benchmarkZero: 0,
    description: "Catch as many sticks as possible",
  },
  {
    slug: "100m-run", name: "100m Run", day: 2, sortOrder: 2,
    unitLabel: "s", decimals: 2, benchmarkStandard: 11, benchmarkZero: 25,
    description: "Run 100 meters as fast as possible",
  },
  {
    slug: "cone-drill", name: "Cone Drill", day: 2, sortOrder: 3,
    unitLabel: "s", decimals: 2, benchmarkStandard: 7, benchmarkZero: 15,
    description: "Run through the designed course as fast as possible",
  },
  {
    slug: "broad-jump", name: "Broad Jump", day: 2, sortOrder: 4,
    unitLabel: "m", decimals: 2, benchmarkStandard: 3.5, benchmarkZero: 0,
    description: "Broad jump for distance",
  },
  {
    slug: "mile-run", name: "Mile Run", day: 2, sortOrder: 5,
    unitLabel: "s", decimals: 2, benchmarkStandard: 300, benchmarkZero: 720,
    description: "Run a mile as fast as possible",
  },
] as const;
