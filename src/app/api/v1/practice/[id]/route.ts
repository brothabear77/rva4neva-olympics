import { api, fromAction } from "@/lib/api";
import { deleteAttempt } from "@/lib/athleteActions";

export const DELETE = api(async (_request: Request, ctx: RouteContext<"/api/v1/practice/[id]">) => {
  const { id } = await ctx.params;
  return fromAction(await deleteAttempt(id));
});
