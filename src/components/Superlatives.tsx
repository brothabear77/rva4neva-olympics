import type { SuperlativeResult } from "@/lib/superlatives";

/**
 * "Most Powerful", "Fastest", and the rest (src/content/superlatives.ts), each a weighted
 * average across a few events rather than one single measurement. Below the leaderboard,
 * not above it: the overall standings are the competition, this is color commentary.
 *
 * Every card gets the same gold accent as the leaderboard's own "Leader" stat, on its
 * title and its outline — the athlete's name stays plain so it doesn't compete with the
 * title for attention. A category with nobody scored in any of its events yet doesn't
 * get a card — better than crowning someone at 0.
 */
export function Superlatives({ results }: { results: SuperlativeResult[] }) {
  const withLeaders = results.filter((r) => r.leaders.length > 0);
  if (withLeaders.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="eyebrow mb-3">Superlatives</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {withLeaders.map(({ category, leaders }) => {
          const [first] = leaders;
          return (
            <div key={category.slug} className="card border-accent p-4">
              <p className="eyebrow text-accent">{category.label}</p>
              <p className="tnum mt-1 font-display text-2xl font-bold text-paper">
                {leaders.map((l) => l.athleteName).join(" & ")}
              </p>
              <p className="mt-1 truncate text-xs text-muted">
                {first.score} avg pts · {first.eventsCounted} of {first.eventsInCategory} events
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
