import { describe, expect, it } from "vitest";
import { EVENTS } from "../eventCatalog";
import { SUPERLATIVE_CATEGORIES } from "../../content/superlatives";
import { categorySlugCounts, computeSuperlatives, type SuperlativeCategory } from "../superlatives";

describe("SUPERLATIVE_CATEGORIES", () => {
  it("covers every real event at least once (an event may be in more than one)", () => {
    const counts = categorySlugCounts(SUPERLATIVE_CATEGORIES);
    const realSlugs = new Set<string>(EVENTS.map((e) => e.slug));

    for (const slug of counts.keys()) {
      expect(realSlugs.has(slug), `"${slug}" is in a category but isn't a real event`).toBe(true);
    }
    for (const slug of realSlugs) {
      expect(counts.get(slug) ?? 0, `${slug} isn't in any category`).toBeGreaterThan(0);
    }
  });

  it("gives every event a positive weight", () => {
    for (const category of SUPERLATIVE_CATEGORIES) {
      for (const event of category.events) {
        expect(event.weight, `${category.slug}/${event.slug}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("computeSuperlatives", () => {
  const strongest: SuperlativeCategory = {
    slug: "strongest",
    label: "Strongest",
    events: [
      { slug: "farmers-walk", weight: 2 },
      { slug: "med-ball-toss", weight: 1 },
    ],
  };

  it("weights each event's points by its share of the category", () => {
    const [result] = computeSuperlatives([strongest], [
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "farmers-walk": 90, "med-ball-toss": 60 } },
    ]);
    // (2*90 + 1*60) / 3 = 80
    expect(result.standings).toEqual([
      { athleteId: "a", athleteName: "Ann", score: 80, eventsCounted: 2, eventsInCategory: 2 },
    ]);
    expect(result.leaders).toEqual(result.standings);
  });

  it("averages over only the events an athlete actually has, not all of them", () => {
    const [result] = computeSuperlatives([strongest], [
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "farmers-walk": 70 } },
    ]);
    // No med-ball-toss score: the average is just the one event, not 70/3.
    expect(result.standings[0]).toMatchObject({ score: 70, eventsCounted: 1 });
  });

  it("leaves out an athlete with no result in any of the category's events", () => {
    const [result] = computeSuperlatives([strongest], [
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "shuttle-run": 99 } },
    ]);
    expect(result.standings).toEqual([]);
    expect(result.leaders).toEqual([]);
  });

  it("sorts best first, ties broken by name", () => {
    const [result] = computeSuperlatives([strongest], [
      { athleteId: "b", athleteName: "Bo", pointsBySlug: { "farmers-walk": 50, "med-ball-toss": 50 } },
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "farmers-walk": 90, "med-ball-toss": 90 } },
      { athleteId: "c", athleteName: "Cy", pointsBySlug: { "farmers-walk": 50, "med-ball-toss": 50 } },
    ]);
    expect(result.standings.map((s) => s.athleteId)).toEqual(["a", "b", "c"]);
  });

  it("puts everyone tied for the top score in leaders", () => {
    const [result] = computeSuperlatives([strongest], [
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "farmers-walk": 80, "med-ball-toss": 80 } },
      { athleteId: "b", athleteName: "Bo", pointsBySlug: { "farmers-walk": 80, "med-ball-toss": 80 } },
      { athleteId: "c", athleteName: "Cy", pointsBySlug: { "farmers-walk": 50, "med-ball-toss": 50 } },
    ]);
    expect(result.leaders.map((s) => s.athleteId)).toEqual(["a", "b"]);
  });

  it("ignores a zero-weighted event instead of dividing by nothing", () => {
    const zeroWeighted: SuperlativeCategory = {
      slug: "zero",
      label: "Zero",
      events: [{ slug: "farmers-walk", weight: 0 }],
    };
    const [result] = computeSuperlatives([zeroWeighted], [
      { athleteId: "a", athleteName: "Ann", pointsBySlug: { "farmers-walk": 90 } },
    ]);
    expect(result.standings).toEqual([]);
  });
});
