import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { getEventsForForm, getLeaderboard } from "@/lib/queries";

// Standings change while people are watching; never serve a cached copy.
export const dynamic = "force-dynamic";

export const metadata = { title: "Live Leaderboard" };

export default async function LeaderboardPage() {
  const [entries, events] = await Promise.all([getLeaderboard(), getEventsForForm()]);

  const scored = entries.filter((e) => e.eventsCompleted > 0);
  const leader = scored[0];
  const runnerUp = scored.find((e) => e.rank > 1);
  const margin = leader && runnerUp ? leader.totalPoints - runnerUp.totalPoints : 0;
  const totalResults = entries.reduce((sum, e) => sum + e.eventsCompleted, 0);

  return (
    <>
      <PageHeader
        eyebrow="Overall standings"
        title="Leaderboard"
        description="Every event converts to points on the same scale, so totals are comparable across the whole competition."
        actions={<LiveRefresh />}
      />

      {scored.length === 0 ? (
        <EmptyState title="No scores yet">
          The board fills in as results come in. Head to{" "}
          <a href="/submit" className="text-accent underline underline-offset-4">
            Submit Results
          </a>{" "}
          to post the first one.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Leader"
              value={leader?.athleteName ?? "—"}
              hint={leader ? `${leader.totalPoints.toLocaleString()} points` : undefined}
              emphasis
            />
            <Stat
              label="Margin"
              value={margin > 0 ? `+${margin.toLocaleString()}` : "Tied"}
              hint={runnerUp ? `over ${runnerUp.athleteName}` : "at the top"}
            />
            <Stat
              label="Results in"
              value={totalResults}
              hint={`of ${entries.length * events.length} possible`}
            />
          </div>

          <LeaderboardTable entries={entries} events={events} />

          <p className="mt-4 text-xs text-muted">
            Tap an athlete to see their score in every event. Ties share a rank.
          </p>
        </>
      )}
    </>
  );
}
