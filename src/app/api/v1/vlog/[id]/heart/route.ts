import { api, fromAction } from "@/lib/api";
import { setHeart } from "@/lib/vlogActions";

type Ctx = RouteContext<"/api/v1/vlog/[id]/heart">;

/** Heart a video. PUT and DELETE state the outcome, so a double tap can't undo itself. */
export const PUT = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return fromAction(await setHeart({ videoId: id, hearted: true }));
});

export const DELETE = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return fromAction(await setHeart({ videoId: id, hearted: false }));
});
