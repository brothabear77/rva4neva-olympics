import { api, fromAction } from "@/lib/api";
import { deleteVlogVideo } from "@/lib/vlogActions";

/** Your own video, or any for the admin. */
export const DELETE = api(async (_request: Request, ctx: RouteContext<"/api/v1/vlog/[id]">) => {
  const { id } = await ctx.params;
  return fromAction(await deleteVlogVideo(id));
});
