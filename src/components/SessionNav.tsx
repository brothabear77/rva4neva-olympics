import { canScore, getSession, isAdmin, isMember } from "@/lib/auth";
import { boolFlag } from "@/lib/launchdarkly";
import { getProfile } from "@/lib/queries";
import { NAV, isNavMenu } from "@/lib/site";
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

  // Every flag a nav item names, evaluated here because the tabs are a client component.
  // Off by default: an item behind a flag stays hidden if LaunchDarkly can't be reached.
  const flagKeys = [
    ...new Set(NAV.flatMap((item) => (isNavMenu(item) ? item.items : [item])).flatMap((link) => (link.featureFlag ? [link.featureFlag] : []))),
  ];
  const enabledFlags = (await Promise.all(flagKeys.map(async (key) => ((await boolFlag(key, false)) ? key : null)))).filter(
    (key): key is string => key !== null,
  );

  return (
    <NavTabs
      canScore={canScore(session)}
      isMember={isMember(session)}
      enabledFlags={enabledFlags}
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
