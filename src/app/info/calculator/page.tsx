import { ScoreCalculator } from "@/components/ScoreCalculator";
import { EmptyState, PageHeader } from "@/components/ui";
import { getEventsForForm, getLeaderboard } from "@/lib/queries";

// Standings feed the projected rank; never serve a cached copy.
export const dynamic = "force-dynamic";

export const metadata = { title: "Score Calculator" };

export default async function CalculatorPage() {
  const [entries, events] = await Promise.all([getLeaderboard(), getEventsForForm()]);

  const athletes = entries
    .map((entry) => ({
      id: entry.athleteId,
      name: entry.athleteName,
      totalPoints: entry.totalPoints,
      byEvent: Object.fromEntries(
        Object.entries(entry.byEventId).map(([eventId, row]) => [eventId, row.rawValue]),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="What if?"
        title="Calculator"
        description="Type a result for each event to see the points it earns, your projected total, and where that would place today. Nothing here is saved."
      />

      {events.length === 0 ? (
        <EmptyState title="No events yet">The calculator needs the event schedule to be loaded first.</EmptyState>
      ) : (
        <ScoreCalculator events={events} athletes={athletes} />
      )}
    </>
  );
}
