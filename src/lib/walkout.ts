/**
 * Walkout songs: the parts that need no network, so they can be tested and shared
 * between the server (src/lib/spotify.ts, src/lib/actions.ts) and the browser.
 *
 * A "song" is usually a Spotify track, but it can also be a podcast episode (a famous
 * soundbite, say). Search only finds tracks; an episode is set by pasting its link.
 */

export type WalkoutKind = "track" | "episode";

export interface WalkoutSong {
  kind: WalkoutKind;
  /** Spotify's 22-character id for the track or episode. */
  spotifyId: string;
  title: string;
  /** A track's credited artists, joined with ", "; for an episode, its show's name. */
  artists: string;
  albumArtUrl: string | null;
}

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

export function isSpotifyId(text: string): boolean {
  return SPOTIFY_ID.test(text);
}

export function isWalkoutKind(text: unknown): text is WalkoutKind {
  return text === "track" || text === "episode";
}

/**
 * What a pasted Spotify reference points at: a track or an episode (with its id), or
 * `{ kind: "other" }` for a Spotify link to something that cannot be a walkout song —
 * an album, playlist, artist or show. Null when it is not a Spotify reference at all,
 * which is to say it is a search.
 */
export type SpotifyLink = { kind: WalkoutKind; id: string } | { kind: "other" };

/**
 * Reads a bare id (taken to be a track), an open.spotify.com link (with or without a
 * market like /intl-de/, a ?si= tracker, or the /embed/ form), or a spotify: URI.
 */
export function parseSpotifyLink(input: string | undefined): SpotifyLink | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  if (isSpotifyId(text)) return { kind: "track", id: text };

  const uri = /^spotify:([a-z-]+):(.*)$/i.exec(text);
  if (uri) return linkTo(uri[1], uri[2]);

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname.toLowerCase() !== "open.spotify.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0]?.startsWith("intl-")) segments.shift();
  if (segments[0] === "embed") segments.shift();
  return linkTo(segments[0] ?? "", segments[1] ?? "");
}

function linkTo(type: string, id: string): SpotifyLink {
  const kind = type.toLowerCase();
  return isWalkoutKind(kind) && isSpotifyId(id) ? { kind, id } : { kind: "other" };
}

type SpotifyImage = { url?: string; width?: number | null; height?: number | null };

/** The parts of Spotify's track JSON that this site reads. */
export interface SpotifyTrackJson {
  id?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { images?: SpotifyImage[] };
}

/** The parts of Spotify's episode JSON that this site reads. */
export interface SpotifyEpisodeJson {
  id?: string;
  name?: string;
  images?: SpotifyImage[];
  show?: { name?: string; images?: SpotifyImage[] };
}

/** Album art is shown at a few dozen pixels; this is the smallest image at least this wide. */
const ART_MIN_WIDTH = 64;

function smallestUsableImage(list: SpotifyImage[] | undefined): string | null {
  const images = (list ?? [])
    .filter((image): image is SpotifyImage & { url: string } => Boolean(image.url))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const art = images.find((image) => (image.width ?? 0) >= ART_MIN_WIDTH) ?? images[images.length - 1];
  return art?.url ?? null;
}

/** Spotify's track JSON to what is stored. Null when it is missing an id or a name. */
export function toWalkoutSong(track: SpotifyTrackJson | null | undefined): WalkoutSong | null {
  if (!track?.id || !isSpotifyId(track.id)) return null;
  const title = track.name?.trim();
  if (!title) return null;

  const artists = (track.artists ?? [])
    .map((a) => a.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");

  return {
    kind: "track",
    spotifyId: track.id,
    title,
    artists: artists || "Unknown artist",
    albumArtUrl: smallestUsableImage(track.album?.images),
  };
}

/** Spotify's episode JSON to what is stored, with the show's art if the episode has none. */
export function episodeToWalkoutSong(episode: SpotifyEpisodeJson | null | undefined): WalkoutSong | null {
  if (!episode?.id || !isSpotifyId(episode.id)) return null;
  const title = episode.name?.trim();
  if (!title) return null;

  return {
    kind: "episode",
    spotifyId: episode.id,
    title,
    artists: episode.show?.name?.trim() || "Unknown show",
    albumArtUrl: smallestUsableImage(episode.images) ?? smallestUsableImage(episode.show?.images),
  };
}

/** "Title by Artist" for a track, "Title from Show" for an episode. */
export function describeWalkout(song: Pick<WalkoutSong, "kind" | "title" | "artists">): string {
  return `${song.title} ${song.kind === "episode" ? "from" : "by"} ${song.artists}`;
}

/** The player Spotify hosts for one track or episode, in its dark theme. */
export function embedUrl(song: Pick<WalkoutSong, "kind" | "spotifyId">): string {
  return `https://open.spotify.com/embed/${song.kind}/${song.spotifyId}?theme=0`;
}

/**
 * How tall that player is at its most compact. A track's player fits in 80px; an
 * episode's does not shrink below 152px.
 */
export function embedHeight(kind: WalkoutKind): number {
  return kind === "episode" ? 152 : 80;
}

/** Postgres's codes for a table (42P01) or a column (42703) that does not exist. */
const NOT_MIGRATED_YET = new Set(["42P01", "42703"]);

/**
 * Whether a database error is Postgres saying a table or column does not exist. Drizzle
 * wraps the driver's error, keeping the original as `cause`, so both are looked at.
 *
 * This is what a deploy looks like for a moment when it ships code that reads a new table
 * or column before the migration that adds it has run (infra/aws.md, "Deploying from GitHub").
 */
export function isMigrationPending(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && typeof e === "object" && depth < 3; depth += 1) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && NOT_MIGRATED_YET.has(code)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
