/** Event-wide settings. Adjust these once you lock the real dates. */
export const SITE = {
  name: "RVA4NEVA Olympics",
  shortName: "RVA4NEVA",
  tagline: "Two days. Ten events. One champion.",
  /** Local ISO datetime the games kick off. Drives the homepage countdown. */
  startsAt: "2027-09-10T10:00:00-04:00",
  days: [
    { day: 1, label: "Day One", date: "2027-09-10" },
    { day: 2, label: "Day Two", date: "2027-09-11" },
  ],
} as const;

/** True once the games have kicked off. Until then the homepage is a teaser. */
export function hasStarted(now: number = Date.now()): boolean {
  return now >= new Date(SITE.startsAt).getTime();
}

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/events", label: "Events" },
  { href: "/submit", label: "Submit Results" },
] as const;
