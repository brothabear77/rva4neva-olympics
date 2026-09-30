import { describe, expect, it } from "vitest";
import {
  describeWalkout,
  embedHeight,
  embedUrl,
  episodeToWalkoutSong,
  isMigrationPending,
  isSpotifyId,
  parseSpotifyLink,
  toWalkoutSong,
} from "../walkout";

const ID = "4uLU6hMCjMI75M1A2tKUQC";

describe("parseSpotifyLink", () => {
  const track = { kind: "track", id: ID };
  const episode = { kind: "episode", id: ID };
  const other = { kind: "other" };

  it("takes a bare id, tidied, to be a track", () => {
    expect(parseSpotifyLink(ID)).toEqual(track);
    expect(parseSpotifyLink(`  ${ID}\n`)).toEqual(track);
  });

  it("reads an open.spotify.com track link, however it was copied", () => {
    expect(parseSpotifyLink(`https://open.spotify.com/track/${ID}`)).toEqual(track);
    expect(parseSpotifyLink(`https://open.spotify.com/track/${ID}?si=abc123def`)).toEqual(track);
    expect(parseSpotifyLink(`https://open.spotify.com/intl-de/track/${ID}`)).toEqual(track);
    expect(parseSpotifyLink(`https://open.spotify.com/embed/track/${ID}`)).toEqual(track);
    expect(parseSpotifyLink(`open.spotify.com/track/${ID}`)).toEqual(track);
  });

  it("reads an episode link the same ways", () => {
    expect(parseSpotifyLink(`https://open.spotify.com/episode/${ID}`)).toEqual(episode);
    expect(parseSpotifyLink(`https://open.spotify.com/episode/${ID}?si=abc123def`)).toEqual(episode);
    expect(parseSpotifyLink(`https://open.spotify.com/intl-fr/embed/episode/${ID}`)).toEqual(episode);
  });

  it("reads a spotify: URI", () => {
    expect(parseSpotifyLink(`spotify:track:${ID}`)).toEqual(track);
    expect(parseSpotifyLink(`spotify:episode:${ID}`)).toEqual(episode);
  });

  it("recognises Spotify links to things that are not a song", () => {
    expect(parseSpotifyLink(`https://open.spotify.com/album/${ID}`)).toEqual(other);
    expect(parseSpotifyLink(`https://open.spotify.com/playlist/${ID}`)).toEqual(other);
    expect(parseSpotifyLink(`https://open.spotify.com/show/${ID}`)).toEqual(other);
    expect(parseSpotifyLink(`spotify:album:${ID}`)).toEqual(other);
    expect(parseSpotifyLink("https://open.spotify.com/track/short")).toEqual(other);
    expect(parseSpotifyLink("https://open.spotify.com/")).toEqual(other);
  });

  it("is null for anything that is not a Spotify reference, so it is searched", () => {
    expect(parseSpotifyLink(undefined)).toBeNull();
    expect(parseSpotifyLink("")).toBeNull();
    expect(parseSpotifyLink("eye of the tiger")).toBeNull();
    expect(parseSpotifyLink(`https://example.com/track/${ID}`)).toBeNull();
    expect(parseSpotifyLink(`https://open.spotify.com.evil.test/track/${ID}`)).toBeNull();
  });
});

describe("isSpotifyId", () => {
  it("is exactly 22 letters and digits", () => {
    expect(isSpotifyId(ID)).toBe(true);
    expect(isSpotifyId(`${ID}x`)).toBe(false);
    expect(isSpotifyId(ID.slice(1))).toBe(false);
    expect(isSpotifyId(`${ID.slice(1)}-`)).toBe(false);
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
      kind: "track",
      spotifyId: ID,
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
    expect(song).toEqual({ kind: "track", spotifyId: ID, title: "Untitled", artists: "Unknown artist", albumArtUrl: null });
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

describe("episodeToWalkoutSong", () => {
  const episode = {
    id: ID,
    name: " The Speech ",
    images: [{ url: "https://i.scdn.co/image/ep300", width: 300 }, { url: "https://i.scdn.co/image/ep64", width: 64 }],
    show: { name: " Great Moments ", images: [{ url: "https://i.scdn.co/image/show64", width: 64 }] },
  };

  it("keeps the id and title, with the show standing in for the artist", () => {
    expect(episodeToWalkoutSong(episode)).toEqual({
      kind: "episode",
      spotifyId: ID,
      title: "The Speech",
      artists: "Great Moments",
      albumArtUrl: "https://i.scdn.co/image/ep64",
    });
  });

  it("uses the show's art when the episode has none", () => {
    expect(episodeToWalkoutSong({ ...episode, images: [] })?.albumArtUrl).toBe("https://i.scdn.co/image/show64");
    expect(episodeToWalkoutSong({ id: ID, name: "x" })).toMatchObject({ artists: "Unknown show", albumArtUrl: null });
  });

  it("returns null without a usable id or name (Spotify answers null for an unavailable episode)", () => {
    expect(episodeToWalkoutSong(null)).toBeNull();
    expect(episodeToWalkoutSong({ id: "nope", name: "x" })).toBeNull();
    expect(episodeToWalkoutSong({ id: ID, name: "" })).toBeNull();
  });
});

describe("describeWalkout", () => {
  it("credits a track's artists and an episode's show", () => {
    expect(describeWalkout({ kind: "track", title: "Eye of the Tiger", artists: "Survivor" })).toBe(
      "Eye of the Tiger by Survivor",
    );
    expect(describeWalkout({ kind: "episode", title: "The Speech", artists: "Great Moments" })).toBe(
      "The Speech from Great Moments",
    );
  });
});

describe("embedUrl", () => {
  it("points at Spotify's player for the track or episode", () => {
    expect(embedUrl({ kind: "track", spotifyId: ID })).toBe(`https://open.spotify.com/embed/track/${ID}?theme=0`);
    expect(embedUrl({ kind: "episode", spotifyId: ID })).toBe(`https://open.spotify.com/embed/episode/${ID}?theme=0`);
  });

  it("is taller for an episode, whose player does not go as compact", () => {
    expect(embedHeight("track")).toBe(80);
    expect(embedHeight("episode")).toBe(152);
  });
});

describe("isMigrationPending", () => {
  it("recognises Postgres's undefined_table and undefined_column errors, bare or wrapped as a cause", () => {
    expect(isMigrationPending({ code: "42P01" })).toBe(true);
    expect(isMigrationPending({ code: "42703" })).toBe(true);
    expect(isMigrationPending(new Error("Failed query", { cause: { code: "42P01" } }))).toBe(true);
    expect(isMigrationPending(new Error("a", { cause: new Error("b", { cause: { code: "42P01" } }) }))).toBe(true);
  });

  it("is false for every other error", () => {
    expect(isMigrationPending({ code: "23503" })).toBe(false);
    expect(isMigrationPending(new Error("connection refused"))).toBe(false);
    expect(isMigrationPending(new Error("x", { cause: { code: "ECONNREFUSED" } }))).toBe(false);
    expect(isMigrationPending(null)).toBe(false);
    expect(isMigrationPending(undefined)).toBe(false);
    expect(isMigrationPending("42P01")).toBe(false);
  });
});
