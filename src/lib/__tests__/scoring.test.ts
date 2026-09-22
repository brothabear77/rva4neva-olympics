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
const cornholeDistance = { benchmarkStandard: 30, benchmarkZero: 0 };
// A sprint: faster (smaller) is better.
const fortyYardDash = { benchmarkStandard: 5, benchmarkZero: 9 };

describe("scoreResult — higher-is-better events", () => {
  it("awards 100 at the top benchmark and 0 at the bottom", () => {
    expect(scoreResult(30, cornholeDistance)).toBe(100);
    expect(scoreResult(0, cornholeDistance)).toBe(0);
  });

  it("interpolates linearly in between", () => {
    expect(scoreResult(15, cornholeDistance)).toBe(50);
    expect(scoreResult(21, cornholeDistance)).toBe(70);
  });

  it("rewards beating the top benchmark rather than capping at 100", () => {
    expect(scoreResult(36, cornholeDistance)).toBe(120);
  });

  it("floors at zero instead of going negative", () => {
    expect(scoreResult(-10, cornholeDistance)).toBe(0);
  });
});

describe("scoreResult — lower-is-better events", () => {
  it("scores the fast benchmark at 100 and the slow one at 0", () => {
    expect(scoreResult(5, fortyYardDash)).toBe(100);
    expect(scoreResult(9, fortyYardDash)).toBe(0);
  });

  it("interpolates with a negative slope", () => {
    expect(scoreResult(7, fortyYardDash)).toBe(50);
    expect(scoreResult(6, fortyYardDash)).toBe(75);
  });

  it("rewards beating the fast benchmark", () => {
    expect(scoreResult(4.5, fortyYardDash)).toBe(113);
  });

  it("floors a very slow time at zero", () => {
    expect(scoreResult(30, fortyYardDash)).toBe(0);
  });
});

describe("scoreResult — bad input cannot crash the leaderboard", () => {
  it("returns 0 when both benchmarks are equal instead of dividing by zero", () => {
    expect(scoreResult(5, { benchmarkStandard: 10, benchmarkZero: 10 })).toBe(0);
  });

  it("returns 0 for non-finite measurements", () => {
    expect(scoreResult(Number.NaN, cornholeDistance)).toBe(0);
    expect(scoreResult(Number.POSITIVE_INFINITY, cornholeDistance)).toBe(0);
  });

  it("returns 0 when a benchmark is non-finite", () => {
    expect(scoreResult(5, { benchmarkStandard: Number.NaN, benchmarkZero: 0 })).toBe(0);
  });

  it("clamps an absurd typo rather than overflowing the points column", () => {
    expect(scoreResult(1e12, cornholeDistance)).toBe(MAX_POINTS);
  });

  it("rounds to whole points", () => {
    expect(scoreResult(1, { benchmarkStandard: 3, benchmarkZero: 0 })).toBe(33);
  });
});

describe("isLowerBetter / isScorable", () => {
  it("detects direction from the benchmarks alone", () => {
    expect(isLowerBetter(fortyYardDash)).toBe(true);
    expect(isLowerBetter(cornholeDistance)).toBe(false);
  });

  it("rejects an event with no scale", () => {
    expect(isScorable({ benchmarkStandard: 7, benchmarkZero: 7 })).toBe(false);
    expect(isScorable(cornholeDistance)).toBe(true);
  });
});

describe("rawForPoints", () => {
  it("round-trips with scoreResult", () => {
    const raw = rawForPoints(70, cornholeDistance);
    expect(raw).toBe(21);
    expect(scoreResult(raw!, cornholeDistance)).toBe(70);
  });

  it("works on a lower-is-better scale", () => {
    expect(rawForPoints(50, fortyYardDash)).toBe(7);
  });

  it("returns null for an unscorable event", () => {
    expect(rawForPoints(50, { benchmarkStandard: 2, benchmarkZero: 2 })).toBeNull();
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
      "100 pts = 5.00 s · 0 pts = 9.00 s",
    );
    expect(describeScale({ benchmarkStandard: 4, benchmarkZero: 4 }, 2, "s")).toBe(
      "Not yet scorable",
    );
  });
});
