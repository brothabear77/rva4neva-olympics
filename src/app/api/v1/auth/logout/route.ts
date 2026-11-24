import { api, json } from "@/lib/api";
import { destroySession } from "@/lib/auth";

/** End this app session. Fine to call when already signed out. */
export const POST = api(async () => {
  await destroySession();
  return json({ message: "Signed out." });
});
