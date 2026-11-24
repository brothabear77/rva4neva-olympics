import { api, json } from "@/lib/api";
import { athletesView } from "@/lib/apiViews";

export const GET = api(async () => json(await athletesView()));
