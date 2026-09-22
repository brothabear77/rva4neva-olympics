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
  { name: "Nick", photo: "", tagline: "BDN", bio: "Former D1 athlete and sometimes shows he's still got it, even if it was over 3 years and 40 pounds ago." },
  { name: "Mena", photo: "", tagline: "Me? Nah.", bio: "Biggest brain, bigger heart. Won't help him much here but we love him anyway." },
  { name: "Allen", photo: "", tagline: "Where them kids at?", bio: "Avid pickleballer, and fan of Michael Jackson for the wrong reasons. Thankfully we're all adults here." },
  { name: "Ashley", photo: "", tagline: "", bio: "Small but mighty. Unfortunately maybe too small, but I wouldn't say that to her face." },
  { name: "David", photo: "", tagline: "Ah hahaha", bio: "You'd think someone who likes to play sports would be more coordinated. If you see him fighting a dog, help the dog." },
  { name: "Marco", photo: "", tagline: "Mohit is a better athlete than David; I would still beat him at tennis", bio: "A gentleman and a scholar. Jury's still out on what he can actually do, but since he wanted to add a 5k, \"not much\" might be a good answer." },
  { name: "Mohit", photo: "", tagline: "", bio: "More of an aesthetic than an athlete. Claims he did high jump in school, but the consensus is he didn't do it well." },
  { name: "Ahmed", photo: "", tagline: "", bio: "The only one who got paid to play sports. Also the only one to hurt themselves in a geriatric sport. He may only need the one hamstring he's got left to compete with this group." },
  { name: "Nat", photo: "", tagline: "", bio: "Not sure anyone is expecting much competition from her. Could pull out an upset if some H-Town or Memphis rap comes on though." },
  { name: "Pam", photo: "", tagline: "P$", bio: "The embodiment of self-belief, and the reason we're not balancing by gender. If you've seen her gymnastics videos from the early 2000s, you'd know balance wasn't her strong suit anyway." }
];
