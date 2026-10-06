import { canScore, getSession, isAdmin } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { AccountMenu } from "./AccountMenu";
import { NavTabs } from "./NavTabs";

/**
 * The header, once the session is known: the account menu, and the Submit tab for
 * scorekeepers. The layout renders it inside Suspense with the plain header as the
 * fallback, so reading the session never holds up the page.
 */
export async function SessionNav() {
  const session = await getSession();
  const profile = session?.athleteId ? await getProfile(session.athleteId) : null;

  return (
    <NavTabs
      canScore={canScore(session)}
      account={
        <AccountMenu
          account={
            session
              ? {
                  name: session.displayName,
                  photo: profile?.photo ?? "",
                  hasProfile: session.athleteId !== null,
                  isAdmin: isAdmin(session),
                }
              : null
          }
        />
      }
    />
  );
}
