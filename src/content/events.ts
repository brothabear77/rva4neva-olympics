import type { EventGuideEntry } from "@/lib/profiles";

/**
 * The event guide, shown on Info -> Events.
 *
 * Every event already gets its scoring explained automatically from its two
 * benchmarks (what a mark is worth, and a small table of example marks), and its
 * short description from the database. An entry here adds what you write:
 *
 *   {
 *     slug: "40-yard-dash",                // the last part of the event's address:
 *                                          // /events/40-yard-dash
 *     summary: "One sprint, timed.",       // replaces the database description (optional)
 *     rules: [                             // one line each                       (optional)
 *       "Two attempts, fastest counts.",
 *       "Standing start behind the line.",
 *     ],
 *     media: { ... },                      // a demo, see below                   (optional)
 *   },
 *
 * A demo is one of:
 *
 *   media: { src: "/events/40-yard-dash.mp4" }             a video in public/events/
 *   media: { src: "/events/40-yard-dash.gif" }             an animated GIF
 *   media: { src: "/events/40-yard-dash.jpg" }             a photo
 *   media: { youtube: "https://youtu.be/dQw4w9WgXcQ" }     a YouTube link, any shape
 *
 * A "t=" on the link (what you get from the Share button, or "Copy video URL at
 * current time") starts the clip there instead of at 0:00 — youtu.be/ID?t=90 and
 * youtu.be/ID?t=1m30s both work.
 *
 * Which of photo, GIF or video a `src` is gets worked out from the file's ending,
 * so there's nothing to declare. Any media entry can also take:
 *
 *   caption: "Marcus setting the pace",    shown under the demo
 *   alt: "A runner leaving the blocks",    read out by screen readers (defaults to the caption)
 *   poster: "/events/40-yard-dash-still.jpg",   a still shown before a video or YouTube clip plays
 *
 * YouTube clips don't load anything from YouTube until someone presses play.
 *
 * If a slug doesn't match an event, or a link or file type can't be read, the page
 * says so while you run it locally.
 */
export const EVENT_GUIDES: EventGuideEntry[] = [
  // {
  //   slug: "40-yard-dash",
  //   summary: "One sprint, timed.",
  //   rules: ["Two attempts, fastest counts.", "Standing start behind the line."],
  //   media: { src: "/events/40-yard-dash.mp4", caption: "Marcus setting the pace" }, 
  // },
  {
    slug: "50m-swim",
    summary: "Swim 50m freestyle",
    rules: [],
    media: {
      youtube: "https://youtu.be/_dhbGLqJuHA?si=E2uDdiTQO2SWteo8&start=10",
      poster: "/events/50m-swim-still.jpg",
    },
  },
  {
    slug: "shuttle-run",
    summary: "5 yards, then 10 the other way, then 5 back to finish",
    rules: ["Three attempts, best time is marked", "Start with body square to center line", "Must touch lines at each end with hand", "Allowed to choose either direction to start"],
    media: {
      youtube: "https://youtu.be/873enchzUKw?si=rI478f-JkRXaog48&start=56",
      poster: "/events/shuttle-run-still.jpg",
    },
  },
  {
    slug: "jump-rope",
    summary: "Jump rope for as many reps as possible in 30 seconds",
    rules: ["Three rounds, best time is marked","Single unders only"],
    media: {
      youtube: "https://youtu.be/BhC7_cTawzE?si=AHtLuw5EjYYfITuH",
      poster: "/events/jump-rope-still.jpg",
    },
  },
  {
    slug: "100m-run",
    summary: "Run 100 meters as fast as possible",
    rules: [],
    media: {
      src: "/events/just-run-bro-still.jpg",
    },
  },
  {
    slug: "mile-run",
    summary: "Run a mile as fast as possible",
    rules: [],
    media: {
      src: "/events/just-run-bro-still.jpg",
    },
  },
  {
    slug: "med-ball-toss",
    summary: "Throw a medicine ball as far as possible",
    rules: ["Three throws, best throw marked", "Throw any style", "Cannot cross throwing line", "Throw marked at landing spot, not rolling"],
    media: {
      youtube: "https://www.youtube.com/watch?v=fzc5aGvOfrs",
      poster: "/events/med-ball-toss-still.jpg",
    },
  },
  {
    slug: "vertical-jump",
    summary: "Vertical jump for height",
    rules: ["Three attempts, best height is marked"],
    media: {},
  },
  {
    slug: "farmers-walk",
    summary: "Farmers walk",
    rules: [],
    media: {
      youtube: "https://www.youtube.com/watch?v=kr6jVQhtKbk",
      poster: "/events/farmers-walk-still.jpg",
    },
  },
  {
    slug: "stick-drop",
    summary: "Catch as many sticks as possible",
    rules: ["Three rounds, total number of sticks caught"],
    media: {
      youtube: "https://www.youtube.com/watch?v=QLjG7lNacWA",
      poster: "/events/stick-drop-still.jpg",
    },
  },
  {
    slug: "cone-drill",
    summary: "Run through the designed course as fast as possible",
    rules: ["Three attempts, best time is marked", "Must go around every cone"],
    media: {
      src: "/events/cone-drill.mov"
    },
  },
  {
    slug: "broad-jump",
    summary: "Broad jump for distance",
    rules: ["Three attempts, best distance counts", "Measured to heel of landing spot"],
    media: {
      youtube: "https://www.youtube.com/watch?v=c6Etg7bpFfI",
      poster: "/events/broad-jump-still.jpg",
    },
  },
];
