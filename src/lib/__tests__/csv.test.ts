import { describe, expect, it } from "vitest";
import { buildImportPreview, parseResultsCsv, type KnownEvent } from "../csv";

const EVENTS: KnownEvent[] = [
  {
    id: "e1", slug: "40-yard-dash", name: "40-Yard Dash",
    unitLabel: "s", decimals: 2, benchmarkStandard: 5, benchmarkZero: 9,
  },
  {
    id: "e2", slug: "keg-toss", name: "Keg Toss",
    unitLabel: "ft", decimals: 1, benchmarkStandard: 30, benchmarkZero: 8,
  },
];

const ATHLETES = [{ id: "a1", name: "Nick" }, { id: "a2", name: "Dana" }];

const preview = (csv: string, existing: Parameters<typeof buildImportPreview>[3] = []) =>
  buildImportPreview(parseResultsCsv(csv), EVENTS, ATHLETES, existing);

describe("parseResultsCsv", () => {
  it("reads the documented header", () => {
    const { rows, missingColumns } = parseResultsCsv(
      "event_slug,athlete_name,raw_value,notes\n40-yard-dash,Nick,5.42,windy",
    );
    expect(missingColumns).toEqual([]);
    expect(rows).toEqual([
      { line: 2, eventSlug: "40-yard-dash", athleteName: "Nick", rawValue: "5.42", notes: "windy" },
    ]);
  });

  it("accepts the header spellings a spreadsheet actually produces", () => {
    const { rows, missingColumns } = parseResultsCsv(
      "Event,Player Name,Result\n40-yard-dash,Nick,5.42",
    );
    expect(missingColumns).toEqual([]);
    expect(rows[0]).toMatchObject({ eventSlug: "40-yard-dash", athleteName: "Nick", rawValue: "5.42" });
  });

  it("trims stray whitespace around values", () => {
    const { rows } = parseResultsCsv("event,athlete,value\n  40-yard-dash , Nick ,  5.42 ");
    expect(rows[0]).toMatchObject({ eventSlug: "40-yard-dash", athleteName: "Nick", rawValue: "5.42" });
  });

  it("reports missing required columns instead of guessing", () => {
    const { missingColumns } = parseResultsCsv("event,notes\n40-yard-dash,hello");
    expect(missingColumns).toEqual(["athleteName", "rawValue"]);
  });

  it("numbers lines the way a spreadsheet does", () => {
    const { rows } = parseResultsCsv("event,athlete,value\na,b,1\nc,d,2");
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });
});

describe("buildImportPreview", () => {
  it("scores new rows and marks them as creates", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,7");
    expect(result.canCommit).toBe(true);
    expect(result.counts.create).toBe(1);
    expect(result.rows[0]).toMatchObject({ action: "create", points: 50, rawValue: 7 });
  });

  it("flags a row that would overwrite an existing score, with the old value", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,6", [
      { eventId: "e1", athleteId: "a1", rawValue: 7, points: 50 },
    ]);
    expect(result.counts.update).toBe(1);
    expect(result.rows[0]).toMatchObject({
      action: "update", points: 75, previousRawValue: 7, previousPoints: 50,
    });
  });

  it("marks a re-upload of identical data as unchanged", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,7", [
      { eventId: "e1", athleteId: "a1", rawValue: 7, points: 50 },
    ]);
    expect(result.counts.unchanged).toBe(1);
  });

  it("notices athletes who are not on the roster yet", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Newcomer,7");
    expect(result.newAthletes).toEqual(["Newcomer"]);
    expect(result.rows[0].createsAthlete).toBe(true);
  });

  it("matches athletes case-insensitively", () => {
    const result = preview("event,athlete,value\n40-yard-dash,nick,7");
    expect(result.newAthletes).toEqual([]);
    expect(result.rows[0].createsAthlete).toBe(false);
  });

  it("matches an event by display name as well as slug", () => {
    const result = preview("event,athlete,value\nKeg Toss,Nick,19");
    expect(result.rows[0]).toMatchObject({ action: "create", eventId: "e2" });
  });
});

describe("buildImportPreview — rejections", () => {
  it("rejects an unknown event", () => {
    const result = preview("event,athlete,value\nbadminton,Nick,7");
    expect(result.canCommit).toBe(false);
    expect(result.rows[0].error).toContain('No event matches "badminton"');
  });

  it("rejects a non-numeric measurement", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,fast");
    expect(result.rows[0].error).toContain("not a number");
  });

  it("rejects the same athlete twice in one event and points at the first line", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,7\n40-yard-dash,Nick,6");
    expect(result.counts.error).toBe(1);
    expect(result.rows[1].error).toContain("Duplicate of line 2");
  });

  it("allows the same athlete in two different events", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,7\nkeg-toss,Nick,19");
    expect(result.canCommit).toBe(true);
    expect(result.counts.create).toBe(2);
  });

  it("blocks the whole import when any single row is bad", () => {
    const result = preview("event,athlete,value\n40-yard-dash,Nick,7\nbadminton,Dana,3");
    expect(result.counts.create).toBe(1);
    expect(result.canCommit).toBe(false);
  });

  it("rejects blank required cells", () => {
    const result = preview("event,athlete,value\n,Nick,7\n40-yard-dash,,7\n40-yard-dash,Nick,");
    expect(result.rows.map((r) => r.error)).toEqual([
      "Missing event", "Missing athlete name", "Missing measurement",
    ]);
  });

  it("refuses an empty file rather than committing nothing", () => {
    expect(preview("event,athlete,value").canCommit).toBe(false);
  });
});
