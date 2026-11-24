import { api, fromAction } from "@/lib/api";
import { removeProposal } from "@/lib/athleteActions";

/** The admin's moderation: removes the proposal and its votes. */
export const DELETE = api(async (_request: Request, ctx: RouteContext<"/api/v1/proposals/[id]">) => {
  const { id } = await ctx.params;
  return fromAction(await removeProposal(id));
});
