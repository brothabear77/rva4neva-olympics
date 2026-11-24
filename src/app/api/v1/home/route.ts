import { api, json } from "@/lib/api";
import { homeView } from "@/lib/apiViews";

export const GET = api(async () => json(await homeView()));
