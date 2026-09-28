import "server-only";
import { toWalkoutSong, type SpotifyTrackJson, type WalkoutSong } from "./walkout";

/**
 * The Spotify Web API, as far as walkout songs need it: search for a track, and look one
 * up by id. No visitor signs in to anything, so this uses the Client Credentials flow —
 * the site's own token, from its client id and secret.
 *
 * Nothing here throws. A failure comes back as `{ ok: false, message }` with words that
 * can be shown to whoever clicked, and the page renders the same either way.
 */

/** What CloudFormation writes into the production secret until real values are set (infra/aws.md). */
const PLACEHOLDER = "not-provisioned-yet";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const TIMEOUT_MS = 5_000;
/** Spotify's development-mode apps are capped on search page size; stay well under it. */
const SEARCH_LIMIT = 8;

function credentials(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret || id === PLACEHOLDER || secret === PLACEHOLDER) return null;
  return { id, secret };
}

// Next's dev server re-evaluates modules on every edit, so the token lives on globalThis
// (as the LaunchDarkly client does) rather than being fetched again after each one.
const globalForSpotify = globalThis as unknown as {
  __olympicsSpotifyToken?: { value: string; expiresAt: number };
  __olympicsSpotifyWarned?: boolean;
};

/** Whether the site has Spotify credentials. Warns once, not on every page view. */
export function spotifyConfigured(): boolean {
  if (credentials()) return true;
  if (!globalForSpotify.__olympicsSpotifyWarned) {
    globalForSpotify.__olympicsSpotifyWarned = true;
    console.warn("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set. Walkout song search is turned off.");
  }
  return false;
}

export type SpotifyResult<T> = { ok: true; data: T } | { ok: false; message: string };

const UNREACHABLE = "Couldn't reach Spotify. Try again in a minute.";
const NOT_CONFIGURED = "Song search isn't set up on this site yet.";

async function accessToken(forceRefresh = false): Promise<string | null> {
  const creds = credentials();
  if (!creds) return null;

  const cached = globalForSpotify.__olympicsSpotifyToken;
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Spotify token request answered ${response.status}`);

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Spotify token response had no access_token");

  // Renewed a minute early, so a request never starts with a token about to lapse.
  globalForSpotify.__olympicsSpotifyToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000,
  };
  return body.access_token;
}

/** GET a Web API path. One retry with a fresh token if the cached one was refused. */
async function apiGet<T>(path: string): Promise<SpotifyResult<T>> {
  if (!credentials()) return { ok: false, message: NOT_CONFIGURED };

  try {
    for (const forceRefresh of [false, true]) {
      const token = await accessToken(forceRefresh);
      if (!token) return { ok: false, message: NOT_CONFIGURED };

      const response = await fetch(`${API_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === 401 && !forceRefresh) continue;
      if (response.status === 404) return { ok: false, message: "Spotify has no song with that link." };
      if (response.status === 429) return { ok: false, message: "Spotify is busy. Try again in a minute." };
      if (!response.ok) {
        console.warn(`Spotify ${path.split("?")[0]} answered ${response.status}`);
        return { ok: false, message: UNREACHABLE };
      }
      return { ok: true, data: (await response.json()) as T };
    }
    return { ok: false, message: UNREACHABLE };
  } catch (error) {
    console.warn(`Spotify request failed: ${(error as Error).message}`);
    return { ok: false, message: UNREACHABLE };
  }
}

/** Songs matching what was typed, best match first. */
export async function searchTracks(query: string): Promise<SpotifyResult<WalkoutSong[]>> {
  const params = new URLSearchParams({ type: "track", limit: String(SEARCH_LIMIT), q: query });
  const found = await apiGet<{ tracks?: { items?: Array<SpotifyTrackJson | null> } }>(`/search?${params}`);
  if (!found.ok) return found;

  const songs = (found.data.tracks?.items ?? [])
    .map((track) => toWalkoutSong(track))
    .filter((song): song is WalkoutSong => song !== null);
  return { ok: true, data: songs };
}

/** One song by its track id. */
export async function getTrack(trackId: string): Promise<SpotifyResult<WalkoutSong>> {
  const found = await apiGet<SpotifyTrackJson>(`/tracks/${encodeURIComponent(trackId)}`);
  if (!found.ok) return found;

  const song = toWalkoutSong(found.data);
  return song ? { ok: true, data: song } : { ok: false, message: "Spotify has no song with that link." };
}
