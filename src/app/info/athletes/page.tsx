import Link from "next/link";
import { AthleteRoster } from "@/components/AthleteRoster";
import { DevNotes } from "@/components/DevNotes";
import { EmptyState, PageHeader } from "@/components/ui";
import { ATHLETE_PROFILES } from "@/content/athletes";
import { mergeAthleteProfiles } from "@/lib/profiles";
import { getEventsForForm, getLeaderboard } from "@/lib/queries";
import { isLocalDev, publicFileMissing } from "@/lib/publicFiles";

export const dynamic = "force-dynamic";

export const metadata = { title: "Athletes" };

export default async function AthletesPage() {
  const [entries, events] = await Promise.all([getLeaderboard(), getEventsForForm()]);

  // A reference page reads best alphabetically; the leaderboard already has the standings.
  const roster = [...entries]
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName))
    .map((entry) => ({ id: entry.athleteId, name: entry.athleteName, standing: entry }));

  const { rows, unmatched, duplicates } = mergeAthleteProfiles(roster, ATHLETE_PROFILES);

  const notes = isLocalDev
    ? [
        ...unmatched.map((p) => `"${p.name}" matches nobody on the roster. Check the spelling.`),
        ...duplicates.map((p) => `"${p.name}" has more than one entry; only the first is used.`),
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

      <DevNotes file="src/content/athletes.ts" notes={notes} />

      {rows.length === 0 ? (
        <EmptyState title="Nobody on the roster yet">
          Athletes appear here as soon as they have a score, or once added from the Submit page.
        </EmptyState>
      ) : (
        <AthleteRoster
          eventCount={events.length}
          rows={rows.map(({ athlete, profile }) => ({
            id: athlete.id,
            name: athlete.name,
            profile,
            standing: athlete.standing,
          }))}
        />
      )}
    </>
  );
}
