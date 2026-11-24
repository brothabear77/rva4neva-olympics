import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { renameAthlete } from "@/lib/authActions";

/** Rename an athlete: yourself, or anyone for the admin. */
export const PATCH = api(async (request: Request, ctx: RouteContext<"/api/v1/athletes/[id]">) => {
  const { id } = await ctx.params;
  const { data, problem } = await body(request, z.object({ name: z.string() }));
  return problem ?? fromAction(await renameAthlete({ athleteId: id, name: data.name }));
});
