import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { scoreLadder, type LadderStep } from "@/lib/profiles";
import { getEventsForForm } from "@/lib/queries";
import { describeScale, isScorable, type ScoringConfig } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export const metadata = { title: "Scoring" };

/**
 * Every mark shown for an example — in its dot plot and in its table — comes from one list
 * of target points, so the two visuals always describe the same numbers. The first and
 * last targets are the edge cases: one mark better than the 100-point benchmark, and
 * (where the event allows it) one worse than the 0-point benchmark.
 */
const WORKED_TARGETS = [115, 100, 75, 50, 25, 0, -15] as const;
/** 50m Swim's zero benchmark (75s) is a cutoff, not a floor — a slower swim is still
 *  possible, so this example gets the full range, including a mark worse than it. */
const SWIM_TARGETS = WORKED_TARGETS;
/** Vertical Jump's zero benchmark (0 inches) is a jump of no height at all — there's no
 *  such thing as a shorter one, so this example has no "worse than zero" mark to show. */
const JUMP_TARGETS = WORKED_TARGETS.filter((target) => target >= 0);

/** The dot plot's axis runs a little past the first and last targets plotted anywhere on
 *  this page, so a top or bottom dot is never flush against the edge of its own line — and
 *  so every example's dots line up on the same axis, whichever targets it uses. */
const DOT_PLOT_DOMAIN_MIN = -20;
const DOT_PLOT_DOMAIN_MAX = 120;

interface Stop extends LadderStep {
  target: number;
}

/** One event's ladder, with each step's target point value attached (`scoreLadder` only
 *  returns what that target actually earns, which the "beyond" edges deliberately clamp). */
function buildStops(config: ScoringConfig, decimals: number, unitLabel: string, targets: readonly number[]): Stop[] {
  return scoreLadder(config, decimals, unitLabel, targets).map((step, index) => ({ ...step, target: targets[index] }));
}

/** A dot per stop, positioned by its target on a shared points axis — not by what it
 *  actually scores, so a mark clamped to 0 or 100 still sits where the straight line
 *  really puts it. */
function DotPlot({ eventName, stops }: { eventName: string; stops: Stop[] }) {
  const summary = stops.map((stop) => `${stop.mark} scores ${stop.points} points`).join("; ");
  const span = DOT_PLOT_DOMAIN_MAX - DOT_PLOT_DOMAIN_MIN;
  const pct = (value: number) => ((value - DOT_PLOT_DOMAIN_MIN) / span) * 100;

  return (
    <div role="img" aria-label={`Dot plot of ${eventName}: ${summary}.`} className="relative mx-4 mt-8 px-2 pb-9 pt-7 sm:mx-8">
      <div aria-hidden="true" className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--edge)]" />
      <div
        aria-hidden="true"
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent/50"
        style={{ left: `calc(${pct(0)}% + 4px)`, width: `calc(${(100 / span) * 100}% - 8px)` }}
      />
      {stops.map((stop, index) => {
        const beyond = index === 0 || index === stops.length - 1;
        return (
          <div
            key={stop.target}
            aria-hidden="true"
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${pct(stop.target)}%` }}
          >
            <span
              className={[
                "tnum mb-1.5 whitespace-nowrap text-xs font-semibold",
                stop.points > 100 ? "text-accent" : "text-paper",
              ].join(" ")}
            >
              {stop.points} pts
            </span>
            <span
              className={[
                "block h-2.5 w-2.5 rounded-full border-2",
                stop.points === 100
                  ? "border-accent bg-accent"
                  : stop.points === 0
                    ? "border-[var(--edge-strong)] bg-ink"
                    : "border-accent bg-ink",
              ].join(" ")}
            />
            <span className={["tnum mt-1.5 whitespace-nowrap text-xs", beyond ? "text-muted/70" : "text-muted"].join(" ")}>
              {stop.mark}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The same stops as a table: exact marks and points, for anyone who wants the numbers
 *  rather than the picture. */
function MarksTable({ eventName, stops }: { eventName: string; stops: Stop[] }) {
  return (
    <table className="mx-auto mt-8 w-full max-w-sm border-collapse text-left text-sm">
      <caption className="sr-only">Example marks for {eventName} and the points they earn</caption>
      <thead>
        <tr className="border-b border-[var(--edge)]">
          <th scope="col" className="eyebrow py-2">Mark</th>
          <th scope="col" className="eyebrow py-2 text-right">Points</th>
        </tr>
      </thead>
      <tbody>
        {stops.map((stop, index) => {
          const beyond = index === 0 || index === stops.length - 1;
          return (
            <tr key={stop.target} className="border-b border-[var(--edge)] last:border-0">
              <td className={["tnum py-2", beyond ? "text-muted" : "text-paper"].join(" ")}>{stop.mark}</td>
              <td
                className={[
                  "tnum py-2 text-right font-semibold",
                  stop.points > 100 ? "text-accent" : beyond ? "text-muted" : "text-paper",
                ].join(" ")}
              >
                {stop.points}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The one place that explains the scoring model in full, so every other page can point
 * here instead of repeating it. Every number on the page comes from real events and the
 * same `scoreLadder` helper Event Guide uses for them, so this page can never drift out of
 * sync with what the site does.
 *
 * Two worked examples, on purpose: 50m Swim (a faster time scores higher, and its
 * zero-point mark is a cutoff a swimmer could still finish slower than) and Vertical Jump
 * (a taller jump scores higher — the opposite direction — and its zero-point mark, no
 * height at all, is a genuine floor rather than a chosen one).
 */
export default async function ScoringPage() {
  const events = await getEventsForForm();
  // Ordered by (day, sortOrder, name) already; the first scorable one is as good a primary
  // example as any, and it's the same event Event Guide would open on first.
  const swim = events.find((event) => isScorable(event));
  const jump = events.find((event) => event.slug === "vertical-jump" && isScorable(event));

  const swimStops = swim ? buildStops(swim, swim.decimals, swim.unitLabel, SWIM_TARGETS) : [];
  const jumpStops = jump ? buildStops(jump, jump.decimals, jump.unitLabel, JUMP_TARGETS) : [];

  const topMark = swimStops.find((stop) => stop.points === 100)?.mark;
  const zeroMark = swimStops.find((stop) => stop.points === 0)?.mark;
  const swimBeyondTop = swimStops[0];
  const swimBeyondZero = swimStops[swimStops.length - 1];
  const jumpBeyondTop = jumpStops[0];
  const jumpZero = jumpStops[jumpStops.length - 1];

  return (
    <>
      <PageHeader
        eyebrow="How scoring works"
        title="Scoring"
        description="One scale for every event, so every event can add up to the same total."
        actions={
          <Link href="/events" className="btn btn-ghost">
            Live standings
          </Link>
        }
      />

      <section className="card space-y-8 p-5 sm:p-6">
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-paper">
              Two benchmarks, per event
            </h2>
            {swim && topMark && zeroMark ? (
              <p className="text-sm leading-relaxed text-paper">
                Each event has two benchmarks: the performance worth 100 points, and
                the one worth 0 points. The {swim.name} calls <span className="tnum">{topMark}</span> worth
                100 points and <span className="tnum">{zeroMark}</span> worth 0. The benchmark performance worth 100 points
                is meant to be an elite performance, while the benchmark performance worth 0 points is meant to be either the
                absolute minimum performance, or a performance so poor it should not be granted points. Ideally, the range
                in the benchmark performances in each event should be similar so that no event is more valuable point-wise.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-paper">
                Each event has two benchmarks: the performance worth 100 points, and
                the one worth 0. The benchmark performance worth 100 points
                is meant to be an elite performance, while the benchmark performance worth 0 points is meant to be either the
                absolute minimum performance, or a performance so poor it should not be granted points. Ideally, the range
                in the benchmark performances in each event should be similar so that no event is more valuable point-wise.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-paper">
              A straight line between them
            </h2>
            <p className="text-sm leading-relaxed text-paper">
              Every performance in between is scored on a linear scale between those two marks.
              Beating the top mark is worth more than 100 points, the same as in a real decathlon. Nothing scores below 0.
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t border-[var(--edge)] pt-8">
          {swim ? (
            <>
              <p className="text-sm leading-relaxed text-paper">
                Take <span className="font-semibold">{swim.name}</span>:{" "}
                <span className="tnum">{describeScale(swim, swim.decimals, swim.unitLabel)}</span>.
                A faster time scores higher. Here is what a few marks in, and just past, that range are worth:
              </p>

              {swimStops.length > 0 ? <DotPlot eventName={swim.name} stops={swimStops} /> : null}
              <MarksTable eventName={swim.name} stops={swimStops} />

              <p className="text-xs text-muted">
                A mark of <span className="tnum">{swimBeyondTop.mark}</span> (better than the 100-point
                benchmark) earns <span className="tnum">{swimBeyondTop.points}</span> points. A mark
                of <span className="tnum">{swimBeyondZero.mark}</span> (worse than the 0-point benchmark)
                earns <span className="tnum">{swimBeyondZero.points}</span> — the same as the benchmark itself.
              </p>

              <Link
                href={`/info/events-guide?event=${swim.slug}`}
                className="inline-block text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
              >
                See {swim.name} in the Event Guide &rarr;
              </Link>
            </>
          ) : (
            <EmptyState title="No scorable event yet">
              This page will show a real example as soon as an event has its scoring scale set.
            </EmptyState>
          )}
        </div>

        {jump ? (
          <div className="space-y-4 border-t border-[var(--edge)] pt-8">
            <p className="text-sm leading-relaxed text-paper">
              A zero-point benchmark isn&apos;t always a chosen cutoff — sometimes it&apos;s a literal zero. 
              Take <span className="font-semibold">{jump.name}</span>:{" "}
              <span className="tnum">{describeScale(jump, jump.decimals, jump.unitLabel)}</span>. There&apos;s no such thing as a jump shorter than
              none at all. Here is what a few marks in, and just past the top, are worth:
            </p>

            {jumpStops.length > 0 ? <DotPlot eventName={jump.name} stops={jumpStops} /> : null}
            <MarksTable eventName={jump.name} stops={jumpStops} />

            <p className="text-xs text-muted">
              A mark of <span className="tnum">{jumpBeyondTop.mark}</span> (better than the 100-point benchmark)
              earns <span className="tnum">{jumpBeyondTop.points}</span> points. There&apos;s nothing below{" "}
              <span className="tnum">{jumpZero.mark}</span> — 0 points here is a floor this event can&apos;t go
              beneath.
            </p>

            <Link
              href={`/info/events-guide?event=${jump.slug}`}
              className="inline-block text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
            >
              See {jump.name} in the Event Guide &rarr;
            </Link>
          </div>
        ) : null}

        <div className="space-y-3 border-t border-[var(--edge)] pt-8">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-paper">
            Tiebreakers
          </h2>
          <p className="text-sm leading-relaxed text-paper">
            Should two or more athletes finish with the same total points, the tiebreaker will be
            determined by whoever has the most points in a single event, cascading to the second highest 
            event, and so on until a winner is determined.
          </p>
        </div>
      </section>
    </>
  );
}
