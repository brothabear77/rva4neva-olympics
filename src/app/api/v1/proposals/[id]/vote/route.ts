import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { castVote, clearVote } from "@/lib/athleteActions";

type Ctx = RouteContext<"/api/v1/proposals/[id]/vote">;

/** Vote Yes or No, or change your vote, while the proposal is open. */
export const PUT = api(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { data, problem } = await body(request, z.object({ inFavor: z.boolean() }));
  return problem ?? fromAction(await castVote({ proposalId: id, inFavor: data.inFavor }));
});

/** Take your vote back. */
export const DELETE = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return fromAction(await clearVote(id));
});
