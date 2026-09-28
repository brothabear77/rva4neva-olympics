import { describe, expect, it } from "vitest";
import { ordinal, projectedRank } from "../calculator";

describe("projectedRank", () => {
  it("is first when nobody has more", () => {
    expect(projectedRank(500, [400, 300])).toEqual({ rank: 1, of: 3 });
  });

  it("is last when everybody has more", () => {
    expect(projectedRank(0, [400, 300])).toEqual({ rank: 3, of: 3 });
  });

  it("shares a rank with a tie, without bumping the tied athlete", () => {
    expect(projectedRank(400, [500, 400, 300])).toEqual({ rank: 2, of: 4 });
  });

  it("is first of one when there is nobody else", () => {
    expect(projectedRank(0, [])).toEqual({ rank: 1, of: 1 });
  });
});

describe("ordinal", () => {
  it("handles the usual suffixes and the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ]);
  });
});
