/**
 * Walkout songs: the parts that need no network, so they can be tested and shared
 * between the server (src/lib/spotify.ts, src/lib/actions.ts) and the browser.
 */

export interface WalkoutSong {
  /** Spotify's 22-character track id. */
  trackId: string;
  title: string;
  /** Every credited artist, joined with ", ". */
  artists: string;
  albumArtUrl: string | null;
}

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

export function isTrackId(text: string): boolean {
  return TRACK_ID.test(text);
}

/**
 * The track id in whatever was pasted: a bare id, an open.spotify.com link (with or
 * without a market like /intl-de/, a ?si= tracker, or the /embed/ form), or a
 * spotify:track: URI. Null if it is none of those — including links to an album or
 * playlist, which have ids of the same shape but are not a song.
 */
export function spotifyTrackId(input: string | undefined): string | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  if (isTrackId(text)) return text;

  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return uri[1];

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
  return segments[0] === "track" && segments[1] && isTrackId(segments[1]) ? segments[1] : null;
}

/** The parts of Spotify's track JSON that this site reads. */
export interface SpotifyTrackJson {
  id?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string; width?: number | null; height?: number | null }> };
}

/** Album art is shown at a few dozen pixels; this is the smallest image at least this wide. */
const ART_MIN_WIDTH = 64;

/** Spotify's track JSON to what is stored. Null when it is missing an id or a name. */
export function toWalkoutSong(track: SpotifyTrackJson | null | undefined): WalkoutSong | null {
  if (!track?.id || !isTrackId(track.id)) return null;
  const title = track.name?.trim();
  if (!title) return null;

  const artists = (track.artists ?? [])
    .map((a) => a.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const images = (track.album?.images ?? [])
    .filter((image): image is { url: string; width?: number | null } => Boolean(image.url))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const art = images.find((image) => (image.width ?? 0) >= ART_MIN_WIDTH) ?? images[images.length - 1];

  return { trackId: track.id, title, artists: artists || "Unknown artist", albumArtUrl: art?.url ?? null };
}

/** The player Spotify hosts for one track, in its dark theme. Compact when the iframe is 80px high. */
export function embedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}?theme=0`;
}

/**
 * Whether a database error is Postgres saying a table does not exist (42P01). Drizzle wraps
 * the driver's error, keeping the original as `cause`, so both are looked at.
 *
 * This is what a deploy looks like for a moment when it ships code that reads a new table
 * before the migration that creates it has run (infra/aws.md, "Deploying from GitHub").
 */
export function isMissingTable(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && typeof e === "object" && depth < 3; depth += 1) {
    if ((e as { code?: unknown }).code === "42P01") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
