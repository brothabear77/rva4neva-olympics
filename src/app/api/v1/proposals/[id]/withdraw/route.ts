import { api, fromAction } from "@/lib/api";
import { withdrawProposal } from "@/lib/athleteActions";

export const POST = api(async (_request: Request, ctx: RouteContext<"/api/v1/proposals/[id]/withdraw">) => {
  const { id } = await ctx.params;
  return fromAction(await withdrawProposal(id));
});
