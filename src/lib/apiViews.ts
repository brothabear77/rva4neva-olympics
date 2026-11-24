import "server-only";
import { QUOTES } from "@/content/quotes";
import { SUPERLATIVE_CATEGORIES } from "@/content/superlatives";
import { getSession, type Session } from "./auth";
import { OPEN_SUBMISSION_FLAG, boolFlag, showChampion, showVlogPage } from "./flags";
import { attachProfiles } from "./profiles";
import {
  allScoresIn,
  getAthleteProfiles,
  getEventSummaries,
  getEventsForForm,
  getLeaderboard,
  getRecentResults,
  getUsername,
  getWalkoutSongs,
} from "./queries";
import { findTies } from "./ranking";
import { cleanQuotes } from "./quotes";
import { registrationLocked } from "./siteSettings";
import { SITE, hasStarted } from "./site";
import { computeSuperlatives } from "./superlatives";

/**
 * What the iOS app's read endpoints return, assembled from the same queries the pages
 * use. Each is one round trip for one screen, so the app isn't stitching four calls
 * together to draw the home page.
 */

/** Static settings and content: kickoff, days, quotes. Rarely changes; the app caches it. */
export function configView() {
  return {
    site: {
      name: SITE.name,
      shortName: SITE.shortName,
      tagline: SITE.tagline,
      timeZone: SITE.timeZone,
      startsAt: SITE.startsAt,
      days: SITE.days,
    },
    quotes: cleanQuotes(QUOTES),
  };
}

/** Who is signed in (or null), plus the switches that decide which screens they see. */
export async function meView(session?: Session | null) {
  const current = session === undefined ? await getSession() : session;
  const [openSubmission, champion, vlog, regLocked, username] = await Promise.all([
    boolFlag(OPEN_SUBMISSION_FLAG, true),
    showChampion(),
    showVlogPage(),
    registrationLocked(),
    current ? getUsername(current.accountId) : Promise.resolve(null),
  ]);
  return {
    account: current
      ? {
          accountId: current.accountId,
          role: current.role,
          athleteId: current.athleteId,
          displayName: current.displayName,
          username,
        }
      : null,
    flags: { openSubmission, showChampion: champion, showVlog: vlog },
    registrationLocked: regLocked,
  };
}

/** The home screen: before kickoff only the countdown; after it, the podium, latest results and any champion. */
export async function homeView() {
  if (!hasStarted()) {
    return { started: false, startsAt: SITE.startsAt, finished: false, podium: [], recent: [], champions: [], events: [] };
  }

  const [entries, events, recent] = await Promise.all([getLeaderboard(), getEventSummaries(), getRecentResults(8)]);
  const finished = allScoresIn(entries, events.length);

  let champions: Array<{ athleteId: string; athleteName: string; totalPoints: number; photo: string | null; walkout: unknown }> = [];
  if (finished && (await showChampion())) {
    const [profiles, walkouts] = await Promise.all([getAthleteProfiles(), getWalkoutSongs()]);
    champions = entries
      .filter((e) => e.rank === 1)
      .map((e) => ({
        athleteId: e.athleteId,
        athleteName: e.athleteName,
        totalPoints: e.totalPoints,
        photo: profiles.get(e.athleteId)?.photo?.trim() || null,
        walkout: walkouts.get(e.athleteId) ?? null,
      }));
  }

  return {
    started: true,
    startsAt: SITE.startsAt,
    finished,
    podium: entries.filter((e) => e.eventsCompleted > 0).slice(0, 3),
    recent,
    champions,
    events: events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, day: e.day, sortOrder: e.sortOrder })),
  };
}

/** The leaderboard screen: standings, the active events (columns), ties explained, and superlatives. */
export async function leaderboardView() {
  const [entries, events] = await Promise.all([getLeaderboard(), getEventsForForm()]);
  const superlatives = computeSuperlatives(
    SUPERLATIVE_CATEGORIES,
    entries.map((e) => ({
      athleteId: e.athleteId,
      athleteName: e.athleteName,
      pointsBySlug: Object.fromEntries(Object.values(e.byEventId).map((r) => [r.eventSlug, r.points])),
    })),
  );
  return { entries, events, ties: findTies(entries), superlatives };
}

/** The roster: everyone alphabetically, with profile, walkout song and where they stand. */
export async function athletesView() {
  const [entries, events, walkouts, profiles] = await Promise.all([
    getLeaderboard(),
    getEventsForForm(),
    getWalkoutSongs(),
    getAthleteProfiles(),
  ]);
  const roster = [...entries]
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName))
    .map((entry) => ({ id: entry.athleteId, name: entry.athleteName, standing: entry }));

  return {
    eventCount: events.length,
    athletes: attachProfiles(roster, profiles).map(({ athlete, profile }) => ({
      id: athlete.id,
      name: athlete.name,
      photo: profile?.photo ?? null,
      tagline: profile?.tagline ?? null,
      bio: profile?.bio ?? null,
      walkout: walkouts.get(athlete.id) ?? null,
      rank: athlete.standing.rank,
      totalPoints: athlete.standing.totalPoints,
      eventsCompleted: athlete.standing.eventsCompleted,
      best: athlete.standing.best,
    })),
  };
}
