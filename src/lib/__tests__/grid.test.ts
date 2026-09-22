import { describe, expect, it } from "vitest";
import {
  cellKey,
  collectChanges,
  collectDeletions,
  isPartialNumber,
  parseCell,
  type GridRow,
} from "../grid";

describe("isPartialNumber — what may be typed", () => {
  it("allows digits, one dot and a leading minus", () => {
    for (const ok of ["", "5", "5.", "5.42", ".5", "-", "-3", "-3.5", "0"]) {
      expect(isPartialNumber(ok), ok).toBe(true);
    }
  });

  it("refuses letters, a second dot, a stray minus and spaces", () => {
    for (const bad of ["a", "5a", "5..4", "1.2.3", "5-", "--1", "1 2", "1,5", "1e5", "+5"]) {
      expect(isPartialNumber(bad), bad).toBe(false);
    }
  });
});

describe("parseCell", () => {
  it("reads a blank cell as empty", () => {
    expect(parseCell("")).toEqual({ kind: "empty" });
    expect(parseCell("   ")).toEqual({ kind: "empty" });
  });

  it("reads numbers, including ones ending in a dot", () => {
    expect(parseCell("5.42")).toEqual({ kind: "number", value: 5.42 });
    expect(parseCell("5.")).toEqual({ kind: "number", value: 5 });
    expect(parseCell(".5")).toEqual({ kind: "number", value: 0.5 });
    expect(parseCell("-3")).toEqual({ kind: "number", value: -3 });
    expect(parseCell("0")).toEqual({ kind: "number", value: 0 });
  });

  it("treats a lone minus or dot as invalid rather than as zero", () => {
    expect(parseCell("-")).toEqual({ kind: "invalid" });
    expect(parseCell(".")).toEqual({ kind: "invalid" });
    expect(parseCell("-.")).toEqual({ kind: "invalid" });
  });

  it("rounds to the four decimals the database keeps", () => {
    expect(parseCell("5.123456")).toEqual({ kind: "number", value: 5.1235 });
    expect(parseCell("5.42")).toEqual({ kind: "number", value: 5.42 });
    expect(parseCell("0.00004")).toEqual({ kind: "number", value: 0 });
  });

  it("range-checks after rounding, since 99999999.99999 rounds up to a value the column cannot hold", () => {
    expect(parseCell("99999999.99999")).toEqual({ kind: "invalid" });
    expect(parseCell("99999999.9999")).toEqual({ kind: "number", value: 99999999.9999 });
  });

  it("rejects an absurdly large value", () => {
    expect(parseCell("100000000")).toEqual({ kind: "invalid" });
    expect(parseCell("99999999")).toEqual({ kind: "number", value: 99999999 });
  });
});

describe("collectChanges", () => {
  const rows: GridRow[] = [
    { athleteId: "a1", name: "Nick" },
    { athleteId: "a2", name: "Dana" },
  ];
  const events = ["e1", "e2"];
  const original = new Map([
    [cellKey("a1", "e1"), 5.42],
    [cellKey("a2", "e2"), 11],
  ]);
  const diff = (edits: Record<string, string>) => collectChanges(rows, events, original, edits);

  it("has no changes when nothing was touched", () => {
    expect(diff({}).changes).toEqual([]);
  });

  it("saves a value typed into an empty cell", () => {
    const { changes, changedKeys } = diff({ [cellKey("a1", "e2")]: "7" });
    expect(changes).toEqual([{ athleteId: "a1", athleteName: "Nick", eventId: "e2", value: 7 }]);
    expect(changedKeys.has(cellKey("a1", "e2"))).toBe(true);
  });

  it("saves a new value typed over an existing one", () => {
    expect(diff({ [cellKey("a1", "e1")]: "5.3" }).changes[0].value).toBe(5.3);
  });

  it("ignores a cell retyped to the value it already had", () => {
    expect(diff({ [cellKey("a1", "e1")]: "5.42" }).changes).toEqual([]);
  });

  it("does not see a permanent change in a value with more decimals than are stored", () => {
    // 5.42 is stored. Typing 5.42000001 rounds to the same 5.42, so it is no change.
    expect(diff({ [cellKey("a1", "e1")]: "5.42000001" }).changes).toEqual([]);
  });

  it("compares numbers, not text: 5.420 and 5.4200 are still 5.42", () => {
    expect(diff({ [cellKey("a1", "e1")]: "5.420" }).changes).toEqual([]);
    expect(diff({ [cellKey("a2", "e2")]: "11.0" }).changes).toEqual([]);
  });

  it("never removes a stored score: a blank cell over one is not a change", () => {
    // a2/e2 holds 11 in the database. Typing then deleting leaves "", and that must
    // not turn into a delete.
    const result = diff({ [cellKey("a2", "e2")]: "" });
    expect(result.changes).toEqual([]);
    expect(result.changedKeys.size).toBe(0);
  });

  it("treats a cell of only spaces the same as a blank one", () => {
    expect(diff({ [cellKey("a2", "e2")]: "   " }).changes).toEqual([]);
  });

  it("does nothing when an already-empty cell is cleared", () => {
    expect(diff({ [cellKey("a1", "e2")]: "" }).changes).toEqual([]);
  });

  it("only ever produces scores to write, never anything else", () => {
    const { changes } = diff({
      [cellKey("a1", "e1")]: "6",
      [cellKey("a2", "e2")]: "",
      [cellKey("a1", "e2")]: "7",
    });
    expect(changes.map((c) => c.value)).toEqual([6, 7]);
    expect(changes.every((c) => typeof c.value === "number")).toBe(true);
  });

  it("flags unusable text as invalid and does not save it", () => {
    const { changes, invalidKeys } = diff({ [cellKey("a1", "e2")]: "-" });
    expect(changes).toEqual([]);
    expect([...invalidKeys]).toEqual([cellKey("a1", "e2")]);
  });

  it("reports several changes in row order", () => {
    const { changes } = diff({
      [cellKey("a2", "e1")]: "9",
      [cellKey("a1", "e2")]: "8",
    });
    expect(changes.map((c) => `${c.athleteName}/${c.eventId}`)).toEqual(["Nick/e2", "Dana/e1"]);
  });

  it("ignores edits for rows and events that are no longer shown", () => {
    expect(diff({ [cellKey("gone", "e1")]: "3", [cellKey("a1", "zzz")]: "3" }).changes).toEqual([]);
  });
});

describe("collectDeletions — delete mode", () => {
  const rows: GridRow[] = [
    { athleteId: "a1", name: "Nick" },
    { athleteId: "a2", name: "Dana" },
  ];
  const events = ["e1", "e2"];
  const original = new Map([
    [cellKey("a1", "e1"), 5.42],
    [cellKey("a2", "e2"), 11],
  ]);
  const del = (edits: Record<string, string>) => collectDeletions(rows, events, original, edits);

  it("deletes nothing when nothing was touched", () => {
    expect(del({}).cells).toEqual([]);
  });

  it("deletes a stored score whose cell was emptied", () => {
    const { cells, changedKeys } = del({ [cellKey("a2", "e2")]: "" });
    expect(cells).toEqual([{ athleteId: "a2", athleteName: "Dana", eventId: "e2" }]);
    expect(changedKeys.has(cellKey("a2", "e2"))).toBe(true);
  });

  it("treats a cell of only spaces as emptied", () => {
    expect(del({ [cellKey("a1", "e1")]: "   " }).cells).toHaveLength(1);
  });

  it("does nothing for an empty cell that never held a score", () => {
    expect(del({ [cellKey("a1", "e2")]: "" }).cells).toEqual([]);
  });

  it("keeps a score whose text is still there", () => {
    expect(del({ [cellKey("a1", "e1")]: "5.42" }).cells).toEqual([]);
    expect(del({ [cellKey("a1", "e1")]: "9" }).cells).toEqual([]);
  });

  it("ignores edits for rows and events that are no longer shown", () => {
    expect(del({ [cellKey("gone", "e1")]: "", [cellKey("a1", "zzz")]: "" }).cells).toEqual([]);
  });

  it("collects several deletions in row order", () => {
    const { cells } = del({ [cellKey("a2", "e2")]: "", [cellKey("a1", "e1")]: "" });
    expect(cells.map((c) => `${c.athleteName}/${c.eventId}`)).toEqual(["Nick/e1", "Dana/e2"]);
  });

  it("is the exact opposite of add mode: the same emptied cell is a deletion here and nothing there", () => {
    const edits = { [cellKey("a2", "e2")]: "" };
    expect(collectChanges(rows, events, original, edits).changes).toEqual([]);
    expect(del(edits).cells).toHaveLength(1);
  });
});
