import { api, json } from "@/lib/api";
import { leaderboardView } from "@/lib/apiViews";

export const GET = api(async () => json(await leaderboardView()));
