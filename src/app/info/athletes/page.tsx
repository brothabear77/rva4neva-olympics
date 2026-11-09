import Link from "next/link";
import { AthleteRoster } from "@/components/AthleteRoster";
import { DevNotes } from "@/components/DevNotes";
import { EmptyState, PageHeader } from "@/components/ui";
import { attachProfiles } from "@/lib/profiles";
import { getAthleteProfiles, getEventsForForm, getLeaderboard, getWalkoutSongs } from "@/lib/queries";
import { getSession, isAdmin } from "@/lib/auth";
import { isLocalDev, publicFileMissing } from "@/lib/publicFiles";

export const dynamic = "force-dynamic";

export const metadata = { title: "Athletes" };

export default async function AthletesPage() {
  const [entries, events, walkoutSongs, storedProfiles, session] = await Promise.all([
    getLeaderboard(),
    getEventsForForm(),
    getWalkoutSongs(),
    getAthleteProfiles(),
    getSession(),
  ]);

  // A reference page reads best alphabetically; the leaderboard already has the standings.
  const roster = [...entries]
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName))
    .map((entry) => ({ id: entry.athleteId, name: entry.athleteName, standing: entry }));

  const rows = attachProfiles(roster, storedProfiles);

  const notes = isLocalDev
    ? [
        ...rows
          .filter((r) => r.profile?.photo && publicFileMissing(r.profile.photo))
          .map((r) => `${r.athlete.name}: no file at public${r.profile?.photo}.`),
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} competing`}
        title="Athletes"
        description="Everyone in the games, and where they stand."
        actions={
          <Link href="/leaderboard" className="btn btn-ghost">
            Leaderboard
          </Link>
        }
      />

      <DevNotes file="the athlete photos" notes={notes} />

      {rows.length === 0 ? (
        <EmptyState title="Nobody on the roster yet">
          Athletes appear here as soon as they sign up.
        </EmptyState>
      ) : (
        <AthleteRoster
          eventCount={events.length}
          rows={rows.map(({ athlete, profile }) => ({
            id: athlete.id,
            name: athlete.name,
            profile,
            walkout: walkoutSongs.get(athlete.id) ?? null,
            standing: athlete.standing,
            profileHref: isAdmin(session) ? `/profile?athlete=${athlete.id}` : undefined,
          }))}
        />
      )}
    </>
  );
}
