import { api, json, refused } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import { getAccounts, getEventsForForm } from "@/lib/queries";
import { registrationLocked } from "@/lib/siteSettings";

/** The admin panel: every account, the registration lock, and the events' scoring settings. */
export const GET = api(async () => {
  const session = await getSession();
  if (!isAdmin(session)) return refused(session);
  const [accounts, locked, events] = await Promise.all([getAccounts(), registrationLocked(), getEventsForForm()]);
  return json({ accounts, registrationLocked: locked, events });
});
