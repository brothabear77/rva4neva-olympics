import { api, fromAction } from "@/lib/api";
import { searchWalkoutSongs } from "@/lib/actions";

/** Spotify search, or a pasted open.spotify.com link. Signed in only (it spends the site's quota). */
export const GET = api(async (request) => {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return fromAction(await searchWalkoutSongs(query));
});
