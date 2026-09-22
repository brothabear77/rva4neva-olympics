import { EVENT_TIME_ZONE, zonedTimeToUtc } from "./time";

/**
 * Kickoff, as the wall-clock time you would say out loud in Eastern time — no
 * UTC offset. The offset for that date (EDT or EST) is worked out below, so
 * moving the date across a clock change cannot leave it an hour off.
 */
const STARTS_AT_LOCAL = "2027-09-10T10:00";

/** Event-wide settings. Adjust these once you lock the real dates. */
export const SITE = {
  name: "#rva4neva Olympics",
  shortName: "#rva4neva",
  tagline: "Two days. Eleven events. One champion.",
  timeZone: EVENT_TIME_ZONE,
  startsAtLocal: STARTS_AT_LOCAL,
  /** The same moment as an absolute UTC instant. Drives the homepage countdown. */
  startsAt: zonedTimeToUtc(STARTS_AT_LOCAL).toISOString(),
  days: [
    { day: 1, label: "Day One", date: "2027-09-10" },
    { day: 2, label: "Day Two", date: "2027-09-11" },
  ],
} as const;

/** True once the games have kicked off. Until then the homepage is a teaser. */
export function hasStarted(now: number = Date.now()): boolean {
  return now >= new Date(SITE.startsAt).getTime();
}

export interface NavLink {
  href: string;
  label: string;
}

/** A tab that opens a small menu of pages instead of going somewhere itself. */
export interface NavMenu {
  label: string;
  items: readonly NavLink[];
}

export type NavItem = NavLink | NavMenu;

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/events", label: "Events" },
  {
    label: "Info",
    items: [
      { href: "/info/athletes", label: "Athletes" },
      { href: "/info/events", label: "Events" },
    ],
  },
  { href: "/submit", label: "Submit Results" },
];

export function isNavMenu(item: NavItem): item is NavMenu {
  return "items" in item;
}
