import Link from "next/link";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Superlatives } from "@/components/Superlatives";
import { Tiebreakers } from "@/components/Tiebreakers";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { SUPERLATIVE_CATEGORIES } from "@/content/superlatives";
import { getEventsForForm, getLeaderboard } from "@/lib/queries";
import { findTies } from "@/lib/ranking";
import { computeSuperlatives } from "@/lib/superlatives";
import { canScore, getSession } from "@/lib/auth";

// Standings change while people are watching; never serve a cached copy.
export const dynamic = "force-dynamic";

export const metadata = { title: "Live Leaderboard" };

export default async function LeaderboardPage() {
  const [entries, events, session] = await Promise.all([getLeaderboard(), getEventsForForm(), getSession()]);

  const scored = entries.filter((e) => e.eventsCompleted > 0);
  const leader = scored[0];
  // The tiebreaker (src/lib/ranking.ts) puts a single athlete first, so the runner-up
  // is simply the next one down; a zero margin means the leader won on the tiebreak.
  const runnerUp = scored[1];
  const margin = leader && runnerUp ? leader.totalPoints - runnerUp.totalPoints : 0;
  const wonOnTiebreak = leader !== undefined && runnerUp !== undefined && margin === 0 && leader.rank < runnerUp.rank;
  const totalResults = entries.reduce((sum, e) => sum + e.eventsCompleted, 0);

  const superlatives = computeSuperlatives(
    SUPERLATIVE_CATEGORIES,
    entries.map((e) => ({
      athleteId: e.athleteId,
      athleteName: e.athleteName,
      pointsBySlug: Object.fromEntries(Object.values(e.byEventId).map((r) => [r.eventSlug, r.points])),
    })),
  );

  return (
    <>
      <PageHeader
        eyebrow="Overall standings"
        title="Leaderboard"
        description="Every athlete's total is the sum of their points across every event."
        actions={<LiveRefresh />}
      />

      {scored.length === 0 ? (
        <EmptyState title="No scores yet">
          The board fills in as results come in.
          {canScore(session) ? (
            <>
              {" "}Head to{" "}
              <a href="/submit" className="text-accent underline underline-offset-4">
                Submit Results
              </a>{" "}
              to post the first one.
            </>
          ) : null}
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
              value={margin > 0 ? `+${margin.toLocaleString()}` : wonOnTiebreak ? "Tiebreak" : "Tied"}
              hint={runnerUp ? `over ${runnerUp.athleteName}` : "at the top"}
            />
            <Stat
              label="Results in"
              value={totalResults}
              hint={`of ${entries.length * events.length} possible`}
            />
          </div>

          <LeaderboardTable entries={entries} events={events} />

          <Tiebreakers ties={findTies(entries)} />

          <Superlatives results={superlatives} />

          <p className="mt-4 text-xs text-muted">
            Tap an athlete to see their score in every event.{" "}
            <Link href="/info/scoring" className="underline-offset-4 hover:text-accent hover:underline">
              How scoring works &rarr;
            </Link>
          </p>
        </>
      )}
    </>
  );
}
