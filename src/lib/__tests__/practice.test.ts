import { describe, expect, it } from "vitest";
import { bestAttempt } from "../practice";

const sprint = { benchmarkStandard: 5, benchmarkZero: 9 };
const jump = { benchmarkStandard: 10, benchmarkZero: 2 };

describe("bestAttempt", () => {
  it("is null with no attempts", () => {
    expect(bestAttempt([], sprint)).toBeNull();
  });
  it("picks the lowest for a timed event", () => {
    const best = bestAttempt([{ rawValue: 7 }, { rawValue: 6 }, { rawValue: 8 }], sprint);
    expect(best?.attempt.rawValue).toBe(6);
    expect(best?.points).toBe(75);
  });
  it("picks the highest for a distance event", () => {
    const best = bestAttempt([{ rawValue: 4 }, { rawValue: 9 }, { rawValue: 6 }], jump);
    expect(best?.attempt.rawValue).toBe(9);
    expect(best?.points).toBe(88);
  });
});
