import { describe, expect, it } from "vitest";
import { closesAtAfterVote, closesAtFor, decideProposal, quorumFor } from "../votes";

const closesAt = new Date("2026-10-13T12:00:00Z");
const after = new Date("2026-10-14T00:00:00Z");
const base = { eligible: 10, closesAt, withdrawnAt: null, now: after };

describe("quorumFor", () => {
  it("is half, rounded up", () => {
    expect(quorumFor(10)).toBe(5);
    expect(quorumFor(11)).toBe(6);
    expect(quorumFor(0)).toBe(0);
  });
});

describe("closesAtFor", () => {
  it("is a week later", () => {
    expect(closesAtFor(new Date("2026-10-06T12:00:00Z")).toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });
});

describe("decideProposal", () => {
  it("is open until the week ends", () => {
    expect(decideProposal({ ...base, yes: 9, no: 0, now: new Date("2026-10-13T11:59:59Z") })).toBe("open");
  });
  it("passes with quorum and more yes than no", () => {
    expect(decideProposal({ ...base, yes: 3, no: 2 })).toBe("passed");
  });
  it("fails without quorum, even if unanimous", () => {
    expect(decideProposal({ ...base, yes: 4, no: 0 })).toBe("no-quorum");
  });
  it("counts exactly half as quorum", () => {
    expect(decideProposal({ ...base, yes: 3, no: 2 })).toBe("passed");
    expect(decideProposal({ ...base, eligible: 11, yes: 3, no: 2 })).toBe("no-quorum");
  });
  it("rejects a tie", () => {
    expect(decideProposal({ ...base, yes: 3, no: 3 })).toBe("rejected");
  });
  it("rejects more no than yes", () => {
    expect(decideProposal({ ...base, yes: 1, no: 5 })).toBe("rejected");
  });
  it("reports a withdrawn proposal as withdrawn, open or closed", () => {
    expect(decideProposal({ ...base, yes: 9, no: 0, withdrawnAt: new Date() })).toBe("withdrawn");
  });
});

describe("closesAtAfterVote", () => {
  const createdAt = new Date("2026-10-06T12:00:00Z");
  const original = "2026-10-13T12:00:00.000Z";

  it("is the original week while someone has yet to vote", () => {
    const now = new Date("2026-10-07T09:00:00Z");
    expect(closesAtAfterVote({ createdAt, now, allVoted: false }).toISOString()).toBe(original);
  });
  it("is 60 seconds after the vote once everyone has voted", () => {
    const now = new Date("2026-10-07T09:00:00Z");
    expect(closesAtAfterVote({ createdAt, now, allVoted: true }).toISOString()).toBe("2026-10-07T09:01:00.000Z");
  });
  it("never runs past the original close", () => {
    const now = new Date("2026-10-13T11:59:30Z");
    expect(closesAtAfterVote({ createdAt, now, allVoted: true }).toISOString()).toBe(original);
  });
  it("goes back to the original week when the full turnout is lost", () => {
    const now = new Date("2026-10-07T09:00:30Z");
    expect(closesAtAfterVote({ createdAt, now, allVoted: false }).toISOString()).toBe(original);
  });
});
