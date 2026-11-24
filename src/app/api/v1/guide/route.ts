import { api, json } from "@/lib/api";
import { buildGuideEvents } from "@/lib/eventGuide";
import { getEventsForForm } from "@/lib/queries";

/** The Event Guide: rules, demo media and the scoring ladder for every active event. */
export const GET = api(async () => json({ events: buildGuideEvents(await getEventsForForm()).guideEvents }));
