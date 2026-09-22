import { describe, expect, it } from "vitest";
import { SITE } from "../site";
import {
  EVENT_TIME_ZONE,
  formatEventClock,
  formatEventDate,
  formatEventDateTime,
  zonedTimeToUtc,
} from "../time";

// Newer ICU builds put a narrow no-break space before AM/PM.
const plain = (text: string) => text.replace(/[  ]/g, " ");
const utc = (local: string) => zonedTimeToUtc(local).toISOString();

describe("zonedTimeToUtc", () => {
  it("uses daylight time in summer: 10:00 Eastern is 14:00 UTC", () => {
    expect(utc("2027-09-10T10:00")).toBe("2027-09-10T14:00:00.000Z");
  });

  it("uses standard time in winter: 10:00 Eastern is 15:00 UTC", () => {
    expect(utc("2027-01-15T10:00")).toBe("2027-01-15T15:00:00.000Z");
  });

  it("switches at the spring clock change (2027-03-14)", () => {
    expect(utc("2027-03-13T12:00")).toBe("2027-03-13T17:00:00.000Z"); // EST
    expect(utc("2027-03-14T12:00")).toBe("2027-03-14T16:00:00.000Z"); // EDT
  });

  it("switches at the autumn clock change (2027-11-07)", () => {
    expect(utc("2027-11-06T12:00")).toBe("2027-11-06T16:00:00.000Z"); // EDT
    expect(utc("2027-11-07T12:00")).toBe("2027-11-07T17:00:00.000Z"); // EST
  });

  it("accepts seconds", () => {
    expect(utc("2027-09-10T10:00:30")).toBe("2027-09-10T14:00:30.000Z");
  });

  it("rejects a value with a UTC offset instead of silently misreading it", () => {
    expect(() => zonedTimeToUtc("2027-09-10T10:00:00-04:00")).toThrow(/no UTC offset/);
    expect(() => zonedTimeToUtc("2027-09-10T10:00Z")).toThrow();
    expect(() => zonedTimeToUtc("not a date")).toThrow();
  });
});

describe("formatting is Eastern regardless of the machine's own zone", () => {
  const instant = "2027-09-10T14:00:00.000Z"; // 10:00 AM EDT

  it("formats a date and time", () => {
    expect(plain(formatEventDateTime(instant))).toBe("Sep 10, 10:00 AM ET");
  });

  it("formats a clock time", () => {
    expect(plain(formatEventClock(instant))).toBe("10:00:00 AM ET");
  });

  it("crosses midnight correctly: 02:30 UTC is still the evening before in Eastern", () => {
    expect(plain(formatEventDateTime("2027-09-11T02:30:00.000Z"))).toBe("Sep 10, 10:30 PM ET");
  });

  it("labels a calendar date with the right weekday", () => {
    expect(formatEventDate("2027-09-10")).toBe("Friday, September 10");
    expect(formatEventDate("2027-09-11")).toBe("Saturday, September 11");
  });
});

describe("site configuration", () => {
  it("resolves kickoff to exactly the wall-clock time written in the config", () => {
    // Round trip: reading the resolved instant back in Eastern gives the
    // configured time, so nobody has to hand-compute an offset when editing it.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: EVENT_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(SITE.startsAt));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;

    expect(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`).toBe(
      SITE.startsAtLocal,
    );
  });
});
