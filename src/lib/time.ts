/**
 * The event runs on Eastern time, and every clock time the site shows is
 * Eastern — whoever is looking and wherever the server happens to run.
 *
 * "Eastern" here means the America/New_York zone, not a fixed UTC offset. That
 * is EDT (UTC-4) in September and EST (UTC-5) in winter, so a time written as
 * "10:00 Eastern" stays 10:00 Eastern if the date ever moves across a clock
 * change. A hard-coded "-05:00" would be an hour wrong all summer.
 *
 * Everything is formatted with an explicit locale and zone. Leaving either as
 * the default makes the server and the browser render different text for the
 * same instant, which React reports as a hydration mismatch.
 */

export const EVENT_TIME_ZONE = "America/New_York";
const LOCALE = "en-US";

/** How far `timeZone` is ahead of UTC at `instant`, in ms (negative in the US). */
function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      // h23, not the default: some engines print midnight as "24".
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );

  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Turn a wall-clock time in `timeZone` into the absolute moment it names.
 * Accepts `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`, with no offset.
 */
export function zonedTimeToUtc(local: string, timeZone: string = EVENT_TIME_ZONE): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) {
    throw new Error(`Expected a local time like 2027-09-10T10:00 (no UTC offset), got "${local}"`);
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map((n) => Number(n ?? 0));
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  // The offset depends on the very instant being solved for, so estimate with
  // the offset at the wall time read as UTC, then correct once with the offset
  // at that estimate. That lands on the right side of a clock change.
  const estimate = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - offsetMs(estimate, timeZone));
}

/** "Sep 19, 8:06 PM ET" */
export function formatEventDateTime(value: Date | string | number): string {
  const text = new Date(value).toLocaleString(LOCALE, {
    timeZone: EVENT_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} ET`;
}

/** "8:06:23 PM ET" */
export function formatEventClock(value: Date | string | number): string {
  const text = new Date(value).toLocaleTimeString(LOCALE, {
    timeZone: EVENT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${text} ET`;
}

/** "Friday, September 10" — for a calendar date written `YYYY-MM-DD`. */
export function formatEventDate(date: string): string {
  // Noon, so the calendar date cannot slip a day in either direction.
  return zonedTimeToUtc(`${date}T12:00`).toLocaleDateString(LOCALE, {
    timeZone: EVENT_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
