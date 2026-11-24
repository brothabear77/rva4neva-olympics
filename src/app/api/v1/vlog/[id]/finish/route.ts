import { api, fromAction } from "@/lib/api";
import { finishVlogUpload } from "@/lib/vlogActions";

/** Step two: checks the whole file arrived, then publishes it. */
export const POST = api(async (_request: Request, ctx: RouteContext<"/api/v1/vlog/[id]/finish">) => {
  const { id } = await ctx.params;
  return fromAction(await finishVlogUpload(id));
});
