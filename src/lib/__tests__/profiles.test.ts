import { describe, expect, it } from "vitest";
import {
  initials,
  mediaProblem,
  mergeAthleteProfiles,
  mergeEventGuides,
  paragraphs,
  resolveMedia,
  scoreLadder,
  youtubeId,
  youtubeStart,
} from "../profiles";

describe("youtubeId", () => {
  const ID = "dQw4w9WgXcQ";

  it("reads every shape a copied link comes in", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
    ]) {
      expect(youtubeId(link), link).toBe(ID);
    }
  });

  it("ignores tracking parameters, timestamps and playlists", () => {
    expect(youtubeId(`https://youtu.be/${ID}?si=abc123&t=42`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}&list=PL123&t=10s`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/watch?feature=share&v=${ID}`)).toBe(ID);
  });

  it("copes with a missing https:// and stray whitespace", () => {
    expect(youtubeId(`youtu.be/${ID}`)).toBe(ID);
    expect(youtubeId(`  www.youtube.com/watch?v=${ID}  `)).toBe(ID);
    expect(youtubeId(`http://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("accepts a bare video id", () => {
    expect(youtubeId(ID)).toBe(ID);
  });

  it("returns null for anything that is not YouTube", () => {
    for (const notYoutube of [
      "",
      "   ",
      undefined,
      "https://vimeo.com/12345678",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "not a link at all",
    ]) {
      expect(youtubeId(notYoutube), String(notYoutube)).toBeNull();
    }
  });

  it("returns null for a YouTube page that is not a video", () => {
    expect(youtubeId("https://www.youtube.com/")).toBeNull();
    expect(youtubeId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
    expect(youtubeId("https://www.youtube.com/playlist?list=PL123")).toBeNull();
  });
});

describe("youtubeStart", () => {
  const ID = "dQw4w9WgXcQ";

  it("reads a plain number of seconds from t= or start=", () => {
    expect(youtubeStart(`https://youtu.be/${ID}?t=90`)).toBe(90);
    expect(youtubeStart(`https://www.youtube.com/embed/${ID}?start=90`)).toBe(90);
  });

  it("reads YouTube's 1h2m3s shape, in any combination", () => {
    expect(youtubeStart(`https://youtu.be/${ID}?t=1h2m3s`)).toBe(3723);
    expect(youtubeStart(`https://youtu.be/${ID}?t=1m30s`)).toBe(90);
    expect(youtubeStart(`https://youtu.be/${ID}?t=90s`)).toBe(90);
    expect(youtubeStart(`https://youtu.be/${ID}?t=2h`)).toBe(7200);
  });

  it("ignores other query parameters, like a share link's si=", () => {
    expect(youtubeStart(`https://youtu.be/${ID}?si=abc123&t=10s`)).toBe(10);
  });

  it("returns null with no timestamp, a zero one, or something unreadable", () => {
    expect(youtubeStart(`https://youtu.be/${ID}`)).toBeNull();
    expect(youtubeStart(`https://youtu.be/${ID}?t=0`)).toBeNull();
    expect(youtubeStart(`https://youtu.be/${ID}?t=nonsense`)).toBeNull();
  });

  it("returns null for anything that is not a YouTube link", () => {
    expect(youtubeStart(ID)).toBeNull();
    expect(youtubeStart("https://vimeo.com/12345678?t=90")).toBeNull();
    expect(youtubeStart(undefined)).toBeNull();
  });
});

describe("resolveMedia", () => {
  it("tells photo, GIF and video apart by extension", () => {
    expect(resolveMedia({ src: "/events/a.jpg" })?.kind).toBe("image");
    expect(resolveMedia({ src: "/events/a.png" })?.kind).toBe("image");
    expect(resolveMedia({ src: "/events/a.webp" })?.kind).toBe("image");
    expect(resolveMedia({ src: "/events/a.gif" })?.kind).toBe("gif");
    expect(resolveMedia({ src: "/events/a.mp4" })?.kind).toBe("video");
    expect(resolveMedia({ src: "/events/a.webm" })?.kind).toBe("video");
  });

  it("ignores the case of the extension and any query string", () => {
    expect(resolveMedia({ src: "/events/A.MP4" })?.kind).toBe("video");
    expect(resolveMedia({ src: "/events/a.gif?v=3" })?.kind).toBe("gif");
    expect(resolveMedia({ src: "/events/a.JPG#top" })?.kind).toBe("image");
  });

  it("does not mistake a dot in a folder name for an extension", () => {
    expect(resolveMedia({ src: "/events.v2/demo" })).toBeNull();
  });

  it("returns null for an unknown type, an empty entry, or nothing at all", () => {
    expect(resolveMedia({ src: "/events/a.pdf" })).toBeNull();
    expect(resolveMedia({ src: "/events/noextension" })).toBeNull();
    expect(resolveMedia({})).toBeNull();
    expect(resolveMedia({ src: "   " })).toBeNull();
    expect(resolveMedia(undefined)).toBeNull();
  });

  it("prefers a YouTube link over a file when both are given", () => {
    const media = resolveMedia({ youtube: "https://youtu.be/dQw4w9WgXcQ", src: "/events/a.mp4" });
    expect(media).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ" });
  });

  it("carries a t= timestamp as start, only where the link has one", () => {
    const withStart = resolveMedia({ youtube: "https://youtu.be/dQw4w9WgXcQ?t=90" });
    const withoutStart = resolveMedia({ youtube: "https://youtu.be/dQw4w9WgXcQ" });
    expect(withStart).toMatchObject({ start: 90 });
    expect(withoutStart?.kind === "youtube" ? withoutStart.start : "wrong kind").toBeUndefined();
  });

  it("falls back to the file when the YouTube link cannot be read", () => {
    expect(resolveMedia({ youtube: "nonsense", src: "/events/a.mp4" })?.kind).toBe("video");
  });

  it("carries the poster only where it means something", () => {
    expect(resolveMedia({ src: "/a.mp4", poster: "/p.jpg" })).toMatchObject({ poster: "/p.jpg" });
    expect(resolveMedia({ youtube: "dQw4w9WgXcQ", poster: "/p.jpg" })).toMatchObject({ poster: "/p.jpg" });
    expect(resolveMedia({ src: "/a.jpg", poster: "/p.jpg" })).not.toHaveProperty("poster");
  });

  it("labels the media: alt text, else the caption, else a default", () => {
    expect(resolveMedia({ src: "/a.jpg", alt: "A man sprinting", caption: "Marcus" })?.label).toBe("A man sprinting");
    expect(resolveMedia({ src: "/a.jpg", caption: "Marcus" })?.label).toBe("Marcus");
    expect(resolveMedia({ src: "/a.jpg" })?.label).toBe("Demonstration");
  });
});

describe("mediaProblem", () => {
  it("is quiet when the entry is fine or absent", () => {
    expect(mediaProblem(undefined)).toBeNull();
    expect(mediaProblem({ src: "/a.mp4" })).toBeNull();
    expect(mediaProblem({ youtube: "https://youtu.be/dQw4w9WgXcQ" })).toBeNull();
  });

  it("explains an unreadable YouTube link, even when a file would have worked", () => {
    expect(mediaProblem({ youtube: "https://vimeo.com/1" })).toMatch(/not a YouTube link/);
    expect(mediaProblem({ youtube: "https://vimeo.com/1", src: "/a.mp4" })).toMatch(/not a YouTube link/);
  });

  it("explains an unknown file type", () => {
    expect(mediaProblem({ src: "/a.pdf" })).toMatch(/\.pdf.*not a file type/);
  });

  it("explains a file with no extension", () => {
    expect(mediaProblem({ src: "/events/demo" })).toMatch(/no file extension/);
  });

  it("explains an entry with neither a file nor a link", () => {
    expect(mediaProblem({ caption: "Marcus" })).toMatch(/needs either a src/);
  });
});

describe("mergeAthleteProfiles", () => {
  const roster = [{ name: "Nick" }, { name: "Dana" }, { name: "Theo" }];

  it("keeps roster order and attaches each profile", () => {
    const { rows } = mergeAthleteProfiles(roster, [{ name: "Theo", bio: "t" }, { name: "Nick", bio: "n" }]);
    expect(rows.map((r) => r.athlete.name)).toEqual(["Nick", "Dana", "Theo"]);
    expect(rows.map((r) => r.profile?.bio ?? null)).toEqual(["n", null, "t"]);
  });

  it("matches ignoring case and extra spaces", () => {
    const { rows, unmatched } = mergeAthleteProfiles(roster, [{ name: "  nICK  ", bio: "n" }]);
    expect(rows[0].profile?.bio).toBe("n");
    expect(unmatched).toEqual([]);
  });

  it("gives an athlete with no profile a null, not a missing row", () => {
    const { rows } = mergeAthleteProfiles(roster, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.profile === null)).toBe(true);
  });

  it("reports a profile that matches nobody, so a typo does not vanish silently", () => {
    const { unmatched } = mergeAthleteProfiles(roster, [{ name: "Nic", bio: "typo" }]);
    expect(unmatched.map((p) => p.name)).toEqual(["Nic"]);
  });

  it("uses the first of two profiles for one name and reports the second", () => {
    const { rows, duplicates } = mergeAthleteProfiles(roster, [
      { name: "Nick", bio: "first" },
      { name: "nick", bio: "second" },
    ]);
    expect(rows[0].profile?.bio).toBe("first");
    expect(duplicates.map((p) => p.bio)).toEqual(["second"]);
  });

  it("ignores a profile with a blank name", () => {
    const { rows, unmatched } = mergeAthleteProfiles(roster, [{ name: "   " }]);
    expect(unmatched).toEqual([]);
    expect(rows.every((r) => r.profile === null)).toBe(true);
  });
});

describe("mergeEventGuides", () => {
  const events = [{ slug: "40-yard-dash" }, { slug: "keg-toss" }];

  it("matches by slug and keeps event order", () => {
    const { rows } = mergeEventGuides(events, [{ slug: "keg-toss", summary: "k" }]);
    expect(rows.map((r) => r.guide?.summary ?? null)).toEqual([null, "k"]);
  });

  it("matches ignoring case", () => {
    expect(mergeEventGuides(events, [{ slug: "Keg-Toss", summary: "k" }]).rows[1].guide?.summary).toBe("k");
  });

  it("reports a slug that matches no event", () => {
    const { unmatched } = mergeEventGuides(events, [{ slug: "keg-tosss", summary: "typo" }]);
    expect(unmatched.map((g) => g.slug)).toEqual(["keg-tosss"]);
  });

  it("reports a duplicate slug", () => {
    const { duplicates } = mergeEventGuides(events, [{ slug: "keg-toss" }, { slug: "keg-toss" }]);
    expect(duplicates).toHaveLength(1);
  });
});

describe("paragraphs", () => {
  it("splits on blank lines and tidies each paragraph", () => {
    expect(paragraphs("One line\nstill one.\n\n  Two.  \n\n\n\nThree.")).toEqual([
      "One line still one.",
      "Two.",
      "Three.",
    ]);
  });

  it("returns nothing for empty or missing text", () => {
    expect(paragraphs("")).toEqual([]);
    expect(paragraphs("  \n\n  ")).toEqual([]);
    expect(paragraphs(undefined)).toEqual([]);
  });
});

describe("initials", () => {
  it("uses one letter for one name and first-and-last for several", () => {
    expect(initials("Nick")).toBe("N");
    expect(initials("dana scully")).toBe("DS");
    expect(initials("Jo van der Berg")).toBe("JB");
  });

  it("copes with odd input", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials("  Marco   Polo  ")).toBe("MP");
  });

  it("does not split an emoji in half", () => {
    expect(initials("🏃 Sam")).toBe("🏃S");
  });
});

describe("scoreLadder", () => {
  const dash = { benchmarkStandard: 4.8, benchmarkZero: 9 };

  it("lays out a lower-is-better event from best to worst", () => {
    const ladder = scoreLadder(dash, 2, "s");
    expect(ladder.map((s) => s.points)).toEqual([100, 75, 50, 25, 0]);
    expect(ladder.map((s) => s.mark)).toEqual(["4.80 s", "5.85 s", "6.90 s", "7.95 s", "9.00 s"]);
  });

  it("lays out a higher-is-better event", () => {
    const ladder = scoreLadder({ benchmarkStandard: 30, benchmarkZero: 0 }, 0, "ft");
    expect(ladder.map((s) => s.mark)).toEqual(["30 ft", "23 ft", "15 ft", "8 ft", "0 ft"]);
  });

  it("shows the points a rounded mark really earns, not the round number it was aimed at", () => {
    // Whole-number events cannot hit every target: 12.5 bags rounds to 13, which is 79.
    const ladder = scoreLadder({ benchmarkStandard: 16, benchmarkZero: 2 }, 0, "bags");
    expect(ladder[1]).toEqual({ points: 79, mark: "13 bags" });
    expect(ladder[0].points).toBe(100);
    expect(ladder[4].points).toBe(0);
  });

  it("omits the unit when the event has none", () => {
    expect(scoreLadder(dash, 2, "")[0].mark).toBe("4.80");
  });

  it("returns nothing for an event with no scale", () => {
    expect(scoreLadder({ benchmarkStandard: 5, benchmarkZero: 5 }, 2, "s")).toEqual([]);
  });
});
