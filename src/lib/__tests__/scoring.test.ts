import { describe, expect, it } from "vitest";
import {
  MAX_POINTS,
  describeScale,
  formatMeasurement,
  isLowerBetter,
  isScorable,
  rawForPoints,
  scoreResult,
} from "../scoring";

// A distance event: farther is better.
const cornholeDistance = { benchmark1000: 30, benchmarkZero: 0 };
// A sprint: faster (smaller) is better.
const fortyYardDash = { benchmark1000: 5, benchmarkZero: 9 };

describe("scoreResult — higher-is-better events", () => {
  it("awards 1000 at the top benchmark and 0 at the bottom", () => {
    expect(scoreResult(30, cornholeDistance)).toBe(1000);
    expect(scoreResult(0, cornholeDistance)).toBe(0);
  });

  it("interpolates linearly in between", () => {
    expect(scoreResult(15, cornholeDistance)).toBe(500);
    expect(scoreResult(21, cornholeDistance)).toBe(700);
  });

  it("rewards beating the top benchmark rather than capping at 1000", () => {
    expect(scoreResult(36, cornholeDistance)).toBe(1200);
  });

  it("floors at zero instead of going negative", () => {
    expect(scoreResult(-10, cornholeDistance)).toBe(0);
  });
});

describe("scoreResult — lower-is-better events", () => {
  it("scores the fast benchmark at 1000 and the slow one at 0", () => {
    expect(scoreResult(5, fortyYardDash)).toBe(1000);
    expect(scoreResult(9, fortyYardDash)).toBe(0);
  });

  it("interpolates with a negative slope", () => {
    expect(scoreResult(7, fortyYardDash)).toBe(500);
    expect(scoreResult(6, fortyYardDash)).toBe(750);
  });

  it("rewards beating the fast benchmark", () => {
    expect(scoreResult(4.5, fortyYardDash)).toBe(1125);
  });

  it("floors a very slow time at zero", () => {
    expect(scoreResult(30, fortyYardDash)).toBe(0);
  });
});

describe("scoreResult — bad input cannot crash the leaderboard", () => {
  it("returns 0 when both benchmarks are equal instead of dividing by zero", () => {
    expect(scoreResult(5, { benchmark1000: 10, benchmarkZero: 10 })).toBe(0);
  });

  it("returns 0 for non-finite measurements", () => {
    expect(scoreResult(Number.NaN, cornholeDistance)).toBe(0);
    expect(scoreResult(Number.POSITIVE_INFINITY, cornholeDistance)).toBe(0);
  });

  it("returns 0 when a benchmark is non-finite", () => {
    expect(scoreResult(5, { benchmark1000: Number.NaN, benchmarkZero: 0 })).toBe(0);
  });

  it("clamps an absurd typo rather than overflowing the points column", () => {
    expect(scoreResult(1e12, cornholeDistance)).toBe(MAX_POINTS);
  });

  it("rounds to whole points", () => {
    expect(scoreResult(1, { benchmark1000: 3, benchmarkZero: 0 })).toBe(333);
  });
});

describe("isLowerBetter / isScorable", () => {
  it("detects direction from the benchmarks alone", () => {
    expect(isLowerBetter(fortyYardDash)).toBe(true);
    expect(isLowerBetter(cornholeDistance)).toBe(false);
  });

  it("rejects an event with no scale", () => {
    expect(isScorable({ benchmark1000: 7, benchmarkZero: 7 })).toBe(false);
    expect(isScorable(cornholeDistance)).toBe(true);
  });
});

describe("rawForPoints", () => {
  it("round-trips with scoreResult", () => {
    const raw = rawForPoints(700, cornholeDistance);
    expect(raw).toBe(21);
    expect(scoreResult(raw!, cornholeDistance)).toBe(700);
  });

  it("works on a lower-is-better scale", () => {
    expect(rawForPoints(500, fortyYardDash)).toBe(7);
  });

  it("returns null for an unscorable event", () => {
    expect(rawForPoints(500, { benchmark1000: 2, benchmarkZero: 2 })).toBeNull();
  });
});

describe("formatting", () => {
  it("respects the event's precision", () => {
    expect(formatMeasurement(5.126, 2)).toBe("5.13");
    expect(formatMeasurement(21, 0)).toBe("21");
  });

  it("shows a dash for a missing measurement", () => {
    expect(formatMeasurement(Number.NaN, 2)).toBe("—");
  });

  it("describes the scale in plain language", () => {
    expect(describeScale(fortyYardDash, 2, "s")).toBe(
      "1000 pts = 5.00 s · 0 pts = 9.00 s",
    );
    expect(describeScale({ benchmark1000: 4, benchmarkZero: 4 }, 2, "s")).toBe(
      "Not yet scorable",
    );
  });
});
