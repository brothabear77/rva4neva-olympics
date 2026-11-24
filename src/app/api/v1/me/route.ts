import { api, json } from "@/lib/api";
import { meView } from "@/lib/apiViews";

/** Who the token belongs to (account is null when signed out or expired), plus feature flags. */
export const GET = api(async () => json(await meView()));
