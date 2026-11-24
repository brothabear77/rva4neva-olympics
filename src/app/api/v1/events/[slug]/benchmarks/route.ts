import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { updateEventBenchmarks } from "@/lib/actions";

/**
 * Retune an event's scale (admin). Every stored score in it is re-scored in the same
 * transaction. The segment is the event's id here: it shares the [slug] folder with the
 * read route, since one level can only have one dynamic name.
 */
export const PATCH = api(async (request: Request, ctx: RouteContext<"/api/v1/events/[slug]/benchmarks">) => {
  const { slug: eventId } = await ctx.params;
  const { data, problem } = await body(
    request,
    z.object({ benchmarkStandard: z.number(), benchmarkZero: z.number(), decimals: z.number().int() }),
  );
  if (problem) return problem;
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("benchmarkStandard", String(data.benchmarkStandard));
  form.set("benchmarkZero", String(data.benchmarkZero));
  form.set("decimals", String(data.decimals));
  return fromAction(await updateEventBenchmarks(form));
});
