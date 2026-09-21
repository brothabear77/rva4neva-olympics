import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, checkAthleteName, deletePrompt, normalizeName } from "../roster";

const roster = [
  { id: "1", name: "Nick" },
  { id: "2", name: "Dana Scully" },
];

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Dana   Scully \n")).toBe("Dana Scully");
    expect(normalizeName("Jo")).toBe("Jo");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("checkAthleteName", () => {
  it("accepts a new name and returns it tidied", () => {
    expect(checkAthleteName("  Theo  ", roster)).toEqual({ ok: true, name: "Theo" });
    expect(checkAthleteName("Mary   Jane", roster)).toEqual({ ok: true, name: "Mary Jane" });
  });

  it("rejects an empty or blank name", () => {
    expect(checkAthleteName("", roster)).toEqual({ ok: false, error: "Enter a name." });
    expect(checkAthleteName("   ", roster)).toEqual({ ok: false, error: "Enter a name." });
  });

  it("rejects a name that is too long, counting characters not bytes", () => {
    expect(checkAthleteName("x".repeat(MAX_NAME_LENGTH), roster).ok).toBe(true);
    expect(checkAthleteName("x".repeat(MAX_NAME_LENGTH + 1), roster)).toEqual({
      ok: false,
      error: "That name is too long.",
    });
    // 80 emoji is 80 characters, though far more bytes.
    expect(checkAthleteName("🏃".repeat(MAX_NAME_LENGTH), roster).ok).toBe(true);
  });

  it("rejects a name already taken, ignoring case and spacing, and says whose it is", () => {
    expect(checkAthleteName("nick", roster)).toEqual({ ok: false, error: "Nick is already on the roster." });
    expect(checkAthleteName("NICK", roster).ok).toBe(false);
    expect(checkAthleteName("dana  scully", roster)).toEqual({
      ok: false,
      error: "Dana Scully is already on the roster.",
    });
  });

  it("does not clash with the athlete being renamed", () => {
    expect(checkAthleteName("Nick", roster, "1")).toEqual({ ok: true, name: "Nick" });
  });

  it("allows a rename that only changes capitalisation", () => {
    expect(checkAthleteName("NICK", roster, "1")).toEqual({ ok: true, name: "NICK" });
  });

  it("still rejects renaming someone to another athlete's name", () => {
    expect(checkAthleteName("Dana Scully", roster, "1")).toEqual({
      ok: false,
      error: "Dana Scully is already on the roster.",
    });
  });
});

describe("deletePrompt", () => {
  it("names the scores that go with the athlete", () => {
    expect(deletePrompt("Casey", 3)).toBe("Delete Casey and their 3 scores?");
    expect(deletePrompt("Casey", 1)).toBe("Delete Casey and their 1 score?");
  });

  it("does not mention scores when there are none", () => {
    expect(deletePrompt("Casey", 0)).toBe("Delete Casey?");
  });
});
