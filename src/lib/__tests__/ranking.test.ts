import { describe, expect, it } from "vitest";
import { compareStandings, findTies, rankStandings } from "../ranking";

/** An athlete with the given per-event points; the total is their sum. */
function athlete(name: string, ...points: number[]) {
  return {
    name,
    totalPoints: points.reduce((sum, p) => sum + p, 0),
    athleteId: name,
    athleteName: name,
    byEventId: Object.fromEntries(points.map((p, i) => [`e${i}`, { points: p, eventName: `Event ${i}` }])),
  };
}

const order = (entries: ReturnType<typeof rankStandings<ReturnType<typeof athlete>>>) =>
  entries.map((e) => `${e.rank}:${e.name}`);

describe("rankStandings", () => {
  it("puts the higher total first, whatever the single scores", () => {
    const ranked = rankStandings([athlete("A", 90, 10), athlete("B", 50, 51)]);
    expect(order(ranked)).toEqual(["1:B", "2:A"]);
    expect(ranked.some((e) => e.wonOnTiebreak)).toBe(false);
  });

  it("splits equal totals by the best single event", () => {
    const ranked = rankStandings([athlete("A", 60, 40), athlete("B", 80, 20)]);
    expect(order(ranked)).toEqual(["1:B", "2:A"]);
    expect(ranked.map((e) => e.wonOnTiebreak)).toEqual([true, true]);
  });

  it("falls to the second best, and deeper, when the best matches", () => {
    expect(order(rankStandings([athlete("A", 80, 50, 30), athlete("B", 80, 60, 20)]))).toEqual(["1:B", "2:A"]);
    expect(order(rankStandings([athlete("A", 80, 60, 20, 10), athlete("B", 80, 60, 15, 15)]))).toEqual(["1:A", "2:B"]);
  });

  it("compares scores by rank, not by the order the events were played", () => {
    const ranked = rankStandings([athlete("A", 40, 80, 30), athlete("B", 80, 30, 40)]);
    expect(ranked.every((e) => e.rank >= 1)).toBe(true);
    expect(compareStandings(athlete("A", 40, 80, 30), athlete("B", 80, 30, 40))).toBe(0);
  });

  it("counts a missing event as 0", () => {
    const ranked = rankStandings([athlete("A", 50, 50), athlete("B", 100)]);
    expect(order(ranked)).toEqual(["1:B", "2:A"]);
  });

  it("shares a rank only when every score is identical, and skips the places below", () => {
    const ranked = rankStandings([athlete("A", 70, 30), athlete("B", 30, 70), athlete("C", 10)]);
    expect(order(ranked)).toEqual(["1:A", "1:B", "3:C"]);
    expect(ranked.some((e) => e.wonOnTiebreak)).toBe(false);
  });

  it("flags only the tied pair, not the rest of the board", () => {
    const ranked = rankStandings([athlete("A", 100, 50), athlete("B", 90, 60), athlete("C", 40)]);
    expect(order(ranked)).toEqual(["1:A", "2:B", "3:C"]);
    expect(ranked.map((e) => e.wonOnTiebreak)).toEqual([true, true, false]);
  });

  it("leaves a roster with no scores all level at 1", () => {
    const ranked = rankStandings([athlete("A"), athlete("B"), athlete("C")]);
    expect(order(ranked)).toEqual(["1:A", "1:B", "1:C"]);
    expect(ranked.some((e) => e.wonOnTiebreak)).toBe(false);
  });

  it("keeps input order for entries nothing separates", () => {
    expect(order(rankStandings([athlete("Z", 50), athlete("A", 50)]))).toEqual(["1:Z", "1:A"]);
  });
});

describe("findTies", () => {
  const ties = (...entries: ReturnType<typeof athlete>[]) => findTies(rankStandings(entries));

  it("is empty when nobody is level", () => {
    expect(ties(athlete("A", 90), athlete("B", 80))).toEqual([]);
  });

  it("ignores athletes level at 0", () => {
    expect(ties(athlete("A"), athlete("B"))).toEqual([]);
  });

  it("shows each tied athlete's scores best first and where the best event decided it", () => {
    const [tie] = ties(athlete("A", 60, 40), athlete("B", 20, 80), athlete("C", 10));
    expect(tie.totalPoints).toBe(100);
    expect(tie.athletes.map((a) => a.athleteName)).toEqual(["B", "A"]);
    expect(tie.athletes[0].scores.map((s) => s.points)).toEqual([80, 20]);
    expect(tie.decidedAt).toEqual([0]);
    expect(tie.depth).toBe(1);
  });

  it("goes as deep as the cascade did", () => {
    const [tie] = ties(athlete("A", 80, 50, 30), athlete("B", 80, 60, 20));
    expect(tie.athletes.map((a) => a.athleteName)).toEqual(["B", "A"]);
    expect(tie.decidedAt).toEqual([1]);
    expect(tie.depth).toBe(2);
  });

  it("lists separate ties separately and marks a tie nothing can split", () => {
    const found = ties(athlete("A", 70, 30), athlete("B", 30, 70), athlete("C", 50), athlete("D", 20, 30));
    expect(found.map((t) => t.totalPoints)).toEqual([100, 50]);
    expect(found[0].decidedAt).toEqual([null]);
    expect(found[0].athletes.map((a) => a.rank)).toEqual([1, 1]);
  });

  it("narrows a three-way tie one score position at a time", () => {
    // 100 each. Best event: C (97) is alone at the top; A and B (90) carry on.
    // Second best: A (6) beats B (5).
    const [tie] = ties(athlete("A", 90, 6, 4), athlete("B", 90, 5, 5), athlete("C", 97, 3));
    expect(tie.athletes.map((a) => a.athleteName)).toEqual(["C", "A", "B"]);
    expect(tie.depth).toBe(2);
    expect(tie.athletes.map((a) => a.settledAt)).toEqual([0, 1, 1]);
    // C and A beat someone out; B is just last.
    expect(tie.athletes.map((a) => a.highlightAt)).toEqual([0, 1, null]);
  });

  it("settles a three-way tie in one row when all the best scores differ", () => {
    const [tie] = ties(athlete("A", 50, 50), athlete("B", 60, 40), athlete("C", 70, 30));
    expect(tie.depth).toBe(1);
    expect(tie.athletes.map((a) => a.settledAt)).toEqual([0, 0, 0]);
    expect(tie.athletes.map((a) => a.highlightAt)).toEqual([0, 0, null]);
  });

  it("leaves athletes whose every score matches unsettled, at the depth of their scores", () => {
    const [tie] = ties(athlete("A", 70, 30), athlete("B", 70, 30), athlete("C", 80, 20));
    expect(tie.athletes.map((a) => a.athleteName)).toEqual(["C", "A", "B"]);
    expect(tie.athletes.map((a) => a.settledAt)).toEqual([0, null, null]);
    expect(tie.depth).toBe(2);
  });
});
