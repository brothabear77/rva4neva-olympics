import type { LadderStep } from "@/lib/profiles";

/** The dot plot's axis runs a little past the first and last targets plotted anywhere on
 *  the site, so a top or bottom dot is never flush against the edge of its own line — and
 *  so every example's dots line up on the same axis, whichever targets it uses. */
const DOT_PLOT_DOMAIN_MIN = -20;
const DOT_PLOT_DOMAIN_MAX = 120;

export interface Stop extends LadderStep {
  target: number;
}

/** A dot per stop, positioned by its target on a shared points axis — not by what it
 *  actually scores, so a mark clamped to 0 or 100 still sits where the straight line
 *  really puts it. */
export function DotPlot({ eventName, stops }: { eventName: string; stops: Stop[] }) {
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
      {stops.map((stop) => {
        const beyond = stop.target > 100 || stop.target < 0;
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
              {stop.mark}
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
              {stop.points} pts
            </span>
          </div>
        );
      })}
    </div>
  );
}

