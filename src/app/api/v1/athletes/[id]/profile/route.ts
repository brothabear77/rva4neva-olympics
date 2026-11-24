import { z } from "zod";
import { api, body, error, fromAction, json } from "@/lib/api";
import { canEditAthlete, getSession, refusal } from "@/lib/auth";
import { statusForFailure } from "@/lib/apiStatus";
import { updateProfile } from "@/lib/authActions";
import { getProfile, getWalkoutSongs } from "@/lib/queries";

type Ctx = RouteContext<"/api/v1/athletes/[id]/profile">;

/** The editable profile: your own, or anyone's for the admin. */
export const GET = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!canEditAthlete(await getSession(), id)) {
    const message = await refusal();
    return error(message, statusForFailure(message));
  }
  const [profile, walkouts] = await Promise.all([getProfile(id), getWalkoutSongs()]);
  if (!profile) return error("That athlete is no longer on the roster.", 404);
  return json({ ...profile, walkout: walkouts.get(id) ?? null });
});

export const PATCH = api(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { data, problem } = await body(request, z.object({ tagline: z.string(), bio: z.string() }));
  return problem ?? fromAction(await updateProfile({ athleteId: id, ...data }));
});
