import { api, json } from "@/lib/api";
import { configView } from "@/lib/apiViews";

/** Kickoff time, the two days and the quotes: content that changes only with a deploy. */
export const GET = api(() => json(configView()));
