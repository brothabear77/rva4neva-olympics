import { describe, expect, it } from "vitest";
import { editDistance, fuzzyMatches, searchWords } from "../fuzzy";

describe("searchWords", () => {
  it("lowercases, drops accents and punctuation", () => {
    expect(searchWords("Café: Cone-Drill, take 3!")).toEqual(["cafe", "cone", "drill", "take", "3"]);
  });
});

describe("editDistance", () => {
  it("counts adds, drops, changes and neighbour swaps as one", () => {
    expect(editDistance("sprint", "sprnt")).toBe(1);
    expect(editDistance("sprint", "sprinnt")).toBe(1);
    expect(editDistance("sprint", "sprunt")).toBe(1);
    expect(editDistance("sprint", "spirnt")).toBe(1);
    expect(editDistance("sprint", "walk")).toBeGreaterThan(2);
  });
});

describe("fuzzyMatches", () => {
  const title = "Cone drill, take three";

  it("matches everything when nothing is typed", () => {
    expect(fuzzyMatches(title, "")).toBe(true);
    expect(fuzzyMatches(title, "  ?! ")).toBe(true);
  });

  it("ignores case and finds half-typed words", () => {
    expect(fuzzyMatches(title, "CONE")).toBe(true);
    expect(fuzzyMatches(title, "dri")).toBe(true);
  });

  it("forgives typos in longer words", () => {
    expect(fuzzyMatches(title, "drll")).toBe(true); // dropped letter
    expect(fuzzyMatches(title, "drilll")).toBe(true); // extra letter
    expect(fuzzyMatches(title, "dirll")).toBe(true); // swapped
    expect(fuzzyMatches("Sprint finish", "sprnt")).toBe(true);
    expect(fuzzyMatches("Highlight reel", "hilight")).toBe(true);
  });

  it("forgives a typo in a half-typed word", () => {
    expect(fuzzyMatches("Sprint finish", "sprnt fin")).toBe(true);
    expect(fuzzyMatches("Sprint finish", "spirn")).toBe(true);
  });

  it("is strict with short words", () => {
    expect(fuzzyMatches("Sun salutations", "run")).toBe(false);
    expect(fuzzyMatches("Cone drill", "cne")).toBe(false);
  });

  it("needs every typed word to match", () => {
    expect(fuzzyMatches(title, "cone three")).toBe(true);
    expect(fuzzyMatches(title, "cone sprint")).toBe(false);
  });

  it("does not match unrelated words", () => {
    expect(fuzzyMatches(title, "marathon")).toBe(false);
  });
});
