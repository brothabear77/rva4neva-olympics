import { api, json } from "@/lib/api";
import { getEventSummaries } from "@/lib/queries";

/** Every event in schedule order, with its benchmarks and current leader. */
export const GET = api(async () => json({ events: await getEventSummaries() }));
