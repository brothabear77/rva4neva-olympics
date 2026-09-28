import { describe, expect, it } from "vitest";
import { embedUrl, isMissingTable, isTrackId, spotifyTrackId, toWalkoutSong } from "../walkout";

const ID = "4uLU6hMCjMI75M1A2tKUQC";

describe("spotifyTrackId", () => {
  it("accepts a bare id, tidied", () => {
    expect(spotifyTrackId(ID)).toBe(ID);
    expect(spotifyTrackId(`  ${ID}\n`)).toBe(ID);
  });

  it("reads an open.spotify.com link, however it was copied", () => {
    expect(spotifyTrackId(`https://open.spotify.com/track/${ID}`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/track/${ID}?si=abc123def`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/intl-de/track/${ID}`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/embed/track/${ID}`)).toBe(ID);
    expect(spotifyTrackId(`open.spotify.com/track/${ID}`)).toBe(ID);
  });

  it("reads a spotify: URI", () => {
    expect(spotifyTrackId(`spotify:track:${ID}`)).toBe(ID);
  });

  it("rejects everything else", () => {
    expect(spotifyTrackId(undefined)).toBeNull();
    expect(spotifyTrackId("")).toBeNull();
    expect(spotifyTrackId("eye of the tiger")).toBeNull();
    expect(spotifyTrackId(`https://open.spotify.com/album/${ID}`)).toBeNull();
    expect(spotifyTrackId(`https://open.spotify.com/playlist/${ID}`)).toBeNull();
    expect(spotifyTrackId(`spotify:album:${ID}`)).toBeNull();
    expect(spotifyTrackId(`https://example.com/track/${ID}`)).toBeNull();
    expect(spotifyTrackId(`https://open.spotify.com.evil.test/track/${ID}`)).toBeNull();
    expect(spotifyTrackId("https://open.spotify.com/track/short")).toBeNull();
  });
});

describe("isTrackId", () => {
  it("is exactly 22 letters and digits", () => {
    expect(isTrackId(ID)).toBe(true);
    expect(isTrackId(`${ID}x`)).toBe(false);
    expect(isTrackId(ID.slice(1))).toBe(false);
    expect(isTrackId(`${ID.slice(1)}-`)).toBe(false);
  });
});

describe("toWalkoutSong", () => {
  const track = {
    id: ID,
    name: "  Eye of the Tiger ",
    artists: [{ name: "Survivor" }],
    album: {
      images: [
        { url: "https://i.scdn.co/image/640", width: 640, height: 640 },
        { url: "https://i.scdn.co/image/300", width: 300, height: 300 },
        { url: "https://i.scdn.co/image/64", width: 64, height: 64 },
      ],
    },
  };

  it("keeps the id, title and artists, and the smallest usable image", () => {
    expect(toWalkoutSong(track)).toEqual({
      trackId: ID,
      title: "Eye of the Tiger",
      artists: "Survivor",
      albumArtUrl: "https://i.scdn.co/image/64",
    });
  });

  it("joins several artists", () => {
    const song = toWalkoutSong({ ...track, artists: [{ name: "A" }, { name: " B " }, {}] });
    expect(song?.artists).toBe("A, B");
  });

  it("copes with no artwork and no artists", () => {
    const song = toWalkoutSong({ id: ID, name: "Untitled", artists: [], album: { images: [] } });
    expect(song).toEqual({ trackId: ID, title: "Untitled", artists: "Unknown artist", albumArtUrl: null });
  });

  it("falls back to the largest image when all are tiny", () => {
    const song = toWalkoutSong({
      id: ID,
      name: "x",
      album: { images: [{ url: "a", width: 20 }, { url: "b", width: 40 }] },
    });
    expect(song?.albumArtUrl).toBe("b");
  });

  it("returns null without a usable id or name", () => {
    expect(toWalkoutSong(null)).toBeNull();
    expect(toWalkoutSong({ name: "x" })).toBeNull();
    expect(toWalkoutSong({ id: "nope", name: "x" })).toBeNull();
    expect(toWalkoutSong({ id: ID, name: "  " })).toBeNull();
  });
});

describe("embedUrl", () => {
  it("points at Spotify's player for the track", () => {
    expect(embedUrl(ID)).toBe(`https://open.spotify.com/embed/track/${ID}?theme=0`);
  });
});

describe("isMissingTable", () => {
  it("recognises Postgres's undefined_table error, bare or wrapped as a cause", () => {
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable(new Error("Failed query", { cause: { code: "42P01" } }))).toBe(true);
    expect(isMissingTable(new Error("a", { cause: new Error("b", { cause: { code: "42P01" } }) }))).toBe(true);
  });

  it("is false for every other error", () => {
    expect(isMissingTable({ code: "23503" })).toBe(false);
    expect(isMissingTable({ code: "42703" })).toBe(false);
    expect(isMissingTable(new Error("connection refused"))).toBe(false);
    expect(isMissingTable(new Error("x", { cause: { code: "ECONNREFUSED" } }))).toBe(false);
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable(undefined)).toBe(false);
    expect(isMissingTable("42P01")).toBe(false);
  });
});
