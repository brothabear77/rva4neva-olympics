import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { clearWalkoutSong, setWalkoutSong } from "@/lib/actions";

type Ctx = RouteContext<"/api/v1/athletes/[id]/walkout">;

/** Set the walkout song from a search result (its kind and Spotify id). */
export const PUT = api(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { data, problem } = await body(
    request,
    z.object({ kind: z.enum(["track", "episode"]), spotifyId: z.string() }),
  );
  return problem ?? fromAction(await setWalkoutSong({ athleteId: id, ...data }));
});

export const DELETE = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return fromAction(await clearWalkoutSong({ athleteId: id }));
});
