import { api, error, json } from "@/lib/api";
import { buildGuideEvents } from "@/lib/eventGuide";
import { getEventBySlug, getEventResults } from "@/lib/queries";

/** One event: its settings, its guide entry and its results, best first. */
export const GET = api(async (_request: Request, ctx: RouteContext<"/api/v1/events/[slug]">) => {
  const { slug } = await ctx.params;
  const event = await getEventBySlug(slug);
  if (!event) return error("No event by that name.", 404);

  const results = await getEventResults(event.id);
  const guide = buildGuideEvents([event]).guideEvents[0] ?? null;
  return json({ event, guide, results });
});
