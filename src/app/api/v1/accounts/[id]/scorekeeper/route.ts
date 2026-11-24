import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { setScorekeeper } from "@/lib/authActions";

/** Let an athlete's account enter scores too (`{ on: true }`), or take that away. */
export const PUT = api(async (request: Request, ctx: RouteContext<"/api/v1/accounts/[id]/scorekeeper">) => {
  const { id } = await ctx.params;
  const { data, problem } = await body(request, z.object({ on: z.boolean() }));
  return problem ?? fromAction(await setScorekeeper({ accountId: id, on: data.on }));
});
