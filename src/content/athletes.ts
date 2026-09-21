import type { AthleteProfile } from "@/lib/profiles";

/**
 * Athlete profiles, shown on Info -> Athletes.
 *
 * Everyone on the roster already gets a row with their standing. A profile here
 * adds a photo, a tagline and a bio to that row. Add one entry per person:
 *
 *   {
 *     name: "Nick",                        // must match the roster; case doesn't matter
 *     photo: "/athletes/nick.jpg",         // a file in public/athletes/  (optional)
 *     tagline: "Perennial runner-up",      // one line under the name     (optional)
 *     bio: `First paragraph.
 *
 *           A blank line starts a new one.`, // (optional)
 *   },
 *
 *   - Every field except `name` is optional, so fill in as much or as little as you
 *     like. Someone with no entry still gets a row.
 *   - Put photos in public/athletes/. Square-ish and under a couple of MB works
 *     best; they're resized for you.
 *   - If a name doesn't match anyone on the roster, or a photo file isn't found,
 *     the page says so while you run it locally, so a typo doesn't just make an
 *     entry quietly never appear.
 *   - Use backticks around text that contains quotation marks.
 */
export const ATHLETE_PROFILES: AthleteProfile[] = [
  // { name: "", photo: "", tagline: "", bio: "" }
  { name: "Nick", photo: "", tagline: "BDN", bio: "Two sentences about Nick." },
  { name: "Mena", photo: "", tagline: "Me? Nah.", bio: "Biggest brain, bigger heart. Won't help him much here but we love him anyway." }
];
