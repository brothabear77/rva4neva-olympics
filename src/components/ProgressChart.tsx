"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMeasurement } from "@/lib/scoring";

export interface ChartPoint {
  /** The calendar day, `YYYY-MM-DD`. */
  date: string;
  value: number;
  /** What this attempt would score at the games. */
  points: number;
}

export interface ChartSeries {
  id: string;
  name: string;
  unit: string;
  decimals: number;
  /** Oldest first. */
  points: ChartPoint[];
}

// The site is dark-only, so only the dark steps are defined: the data-viz palette's eight
// categorical hues in their fixed order (checked with the palette validator against the card
// color: lightness, chroma, colorblind separation and contrast all pass).
const SERIES_VARS = {
  "--series-1": "#3987e5",
  "--series-2": "#d95926",
  "--series-3": "#199e70",
  "--series-4": "#c98500",
  "--series-5": "#d55181",
  "--series-6": "#008300",
  "--series-7": "#9085e9",
  "--series-8": "#e66767",
} as React.CSSProperties;
const HUES = 8;

/**
 * How a slot is drawn. There are eight validated hues and eleven events, and a ninth hue
 * can't be made up without two of them becoming indistinguishable. So slots 9 onward reuse
 * the first hues again, told apart by a second channel: a dashed line and square dots.
 * Hovering a name settles any remaining doubt.
 */
function styleOf(slot: number) {
  const dashed = slot >= HUES;
  return { color: `var(--series-${(slot % HUES) + 1})`, dashed };
}

/** The line-and-dot key that stands for a series in the filter row and the tooltip. */
function SeriesKey({ slot, className = "" }: { slot: number | null; className?: string }) {
  const { color, dashed } = slot === null ? { color: "var(--edge-strong)", dashed: false } : styleOf(slot);
  return (
    <svg aria-hidden="true" width={24} height={10} viewBox="0 0 24 10" className={["shrink-0", className].join(" ")}>
      <line x1={1} x2={23} y1={5} y2={5} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "5 3" : undefined} />
      {slot === null ? null : dashed ? (
        <rect x={8.5} y={1.5} width={7} height={7} rx={1} fill={color} />
      ) : (
        <circle cx={12} cy={5} r={3.5} fill={color} />
      )}
    </svg>
  );
}

const HEIGHT = 340; // the plot and the x-axis band together
const MARGIN = { top: 14, bottom: 30, left: 40 };
const DAY = 24 * 60 * 60 * 1000;

const asTime = (date: string) => Date.parse(`${date}T12:00:00Z`);
const dayLabel = (date: string, withYear = true) =>
  new Date(asTime(date)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });

/** Month starts across the domain, thinned to about six labels. */
function monthTicks(from: number, to: number): Array<{ t: number; label: string }> {
  const start = new Date(from);
  const cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  const all: number[] = [];
  for (let t = cursor; t <= to; ) {
    all.push(t);
    const d = new Date(t);
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  const every = Math.max(1, Math.ceil(all.length / 6));
  return all
    .filter((_, i) => i % every === 0)
    .map((t, i) => {
      const d = new Date(t);
      const month = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
      return { t, label: i === 0 || d.getUTCMonth() === 0 ? `${month} ’${String(d.getUTCFullYear()).slice(2)}` : month };
    });
}

/**
 * Every logged attempt over time, scored in points so events with different units
 * (seconds, inches, reps) can share one axis, and higher always means better.
 *
 * The events are a checkbox filter above the chart, any number of them. Each selected event
 * takes the lowest free color slot and keeps it until it is unchecked, so ticking another
 * never repaints the ones already showing. Hovering or focusing an event's name spotlights
 * its line and mutes the rest, which is what keeps eleven lines readable. The axes are fixed
 * to the full data, so the frame holds still while you filter. Hovering the chart (or
 * arrowing through the dates) reads out every selected event at that date; the table view
 * has the same numbers.
 */
export function ProgressChart({ series, defaultIds }: { series: ChartSeries[]; defaultIds: string[] }) {
  const titleId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [slots, setSlots] = useState<Record<string, number>>(() =>
    Object.fromEntries(defaultIds.map((id, slot) => [id, slot])),
  );
  // The event whose name is hovered or focused: its line stays, the others are muted.
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<string | null>(null); // the date under the pointer or focus

  const selected = useMemo(() => series.filter((s) => s.id in slots), [series, slots]);
  const nothingPicked = selected.length === 0;

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [table, nothingPicked]);

  const toggle = (id: string) =>
    setSlots((current) => {
      if (id in current) {
        const { [id]: _removed, ...rest } = current;
        return rest;
      }
      const used = new Set(Object.values(current));
      const free = Array.from({ length: series.length }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
      return { ...current, [id]: free };
    });

  // Unchecking the event under the pointer would leave it spotlighted with nothing to show.
  const muted = (id: string) => spotlight !== null && spotlight !== id && spotlight in slots;

  // Fixed to all the data, not the selection, so the frame doesn't jump as you filter.
  const domain = useMemo(() => {
    const times = series.flatMap((s) => s.points.map((p) => asTime(p.date)));
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    const pad = Math.max((hi - lo) * 0.03, 3 * DAY);
    const top = Math.max(...series.flatMap((s) => s.points.map((p) => p.points)));
    return { from: lo - pad, to: hi + pad, yMax: Math.max(50, Math.ceil((top * 1.05) / 25) * 25) };
  }, [series]);

  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const y = (points: number) => MARGIN.top + plotH - (points / domain.yMax) * plotH;

  // Direct labels at each line's last point, only when they fit: a phone is too narrow, past
  // four lines they crowd, and if any two would collide they all go. Nudging them apart would
  // detach them from their lines, and the legend names every line anyway. The height of a
  // label doesn't depend on the width, so this is settled before the right margin is.
  const lastHeights = selected.map((s) => y(s.points[s.points.length - 1].points)).sort((a, b) => a - b);
  const showLabels =
    width >= 560 && selected.length <= 4 && lastHeights.every((h, i) => i === 0 || h - lastHeights[i - 1] >= 15);
  const marginRight = showLabels ? 124 : 16;
  const plotW = Math.max(0, width - MARGIN.left - marginRight);
  const x = (time: number) => MARGIN.left + ((time - domain.from) / (domain.to - domain.from)) * plotW;

  const yTicks = useMemo(() => {
    const step = domain.yMax > 150 ? 50 : 25;
    return Array.from({ length: Math.floor(domain.yMax / step) + 1 }, (_, i) => i * step);
  }, [domain.yMax]);

  // Every date any selected event was logged, for the crosshair to snap to.
  const dates = useMemo(
    () => [...new Set(selected.flatMap((s) => s.points.map((p) => p.date)))].sort(),
    [selected],
  );
  const activeDate = active && dates.includes(active) ? active : null;

  const nearestDate = (clientX: number, rect: DOMRect) => {
    const time = domain.from + ((clientX - rect.left - MARGIN.left) / plotW) * (domain.to - domain.from);
    return dates.reduce<string | null>(
      (best, d) => (best === null || Math.abs(asTime(d) - time) < Math.abs(asTime(best) - time) ? d : best),
      null,
    );
  };

  const endLabels = showLabels
    ? selected.map((s) => {
        const last = s.points[s.points.length - 1];
        return { id: s.id, name: s.name, slot: slots[s.id], y: y(last.points), x: x(asTime(last.date)) };
      })
    : [];

  const readout = activeDate
    ? selected.map((s) => {
        const upTo = s.points.filter((p) => p.date <= activeDate);
        const point = upTo[upTo.length - 1] ?? null;
        return { s, point, exact: point?.date === activeDate };
      })
    : [];

  const tableRows = useMemo(
    () =>
      selected
        .flatMap((s) => s.points.map((p) => ({ s, p })))
        .sort((a, b) => (a.p.date === b.p.date ? a.s.name.localeCompare(b.s.name) : a.p.date < b.p.date ? 1 : -1)),
    [selected],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dates.length === 0) return;
    const at = activeDate ? dates.indexOf(activeDate) : -1;
    if (e.key === "ArrowRight") setActive(dates[Math.min(dates.length - 1, at + 1)]);
    else if (e.key === "ArrowLeft") setActive(dates[Math.max(0, at === -1 ? dates.length - 1 : at - 1)]);
    else if (e.key === "Home") setActive(dates[0]);
    else if (e.key === "End") setActive(dates[dates.length - 1]);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const tipLeft = activeDate ? x(asTime(activeDate)) : 0;
  const tipFlip = tipLeft > width * 0.55;

  return (
    <div style={SERIES_VARS} className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="font-display text-xl font-bold uppercase tracking-wide text-paper">
            Points over time
          </h3>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Each dot is an attempt, scored the way it would be at the games: 100 points is the event&apos;s top mark.
            Higher is better in every event.
          </p>
        </div>
        <button type="button" aria-pressed={table} onClick={() => setTable((v) => !v)} className="btn btn-ghost">
          {table ? "Chart view" : "Table view"}
        </button>
      </div>

      {/* One row of filters above the chart. The checkboxes are the legend too: each
          selected event has its line key beside its name, and hovering or focusing the
          name spotlights that line. */}
      <fieldset className="mt-4 min-w-0">
        <legend className="eyebrow mb-2">Events</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {series.map((s) => {
            const checked = s.id in slots;
            return (
              <label
                key={s.id}
                onPointerEnter={() => checked && setSpotlight(s.id)}
                onPointerLeave={() => setSpotlight(null)}
                onFocus={() => checked && setSpotlight(s.id)}
                onBlur={() => setSpotlight(null)}
                className="flex items-center gap-2 text-sm text-paper"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <SeriesKey slot={checked ? slots[s.id] : null} />
                {s.name}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Hover an event&apos;s name to spotlight its line.
        </p>
      </fieldset>

      {selected.length === 0 ? (
        <p className="mt-6 rounded-lg border border-[var(--edge)] px-4 py-10 text-center text-sm text-muted">
          Pick an event above to see its attempts.
        </p>
      ) : table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Every logged attempt for the selected events, newest first</caption>
            <thead>
              <tr className="eyebrow border-b border-[var(--edge)]">
                <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                <th scope="col" className="py-2 pr-4 font-medium">Event</th>
                <th scope="col" className="py-2 pr-4 font-medium">Result</th>
                <th scope="col" className="py-2 font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--edge)]">
              {tableRows.map(({ s, p }, i) => (
                <tr key={`${s.id}-${p.date}-${i}`}>
                  <td className="py-2 pr-4 text-muted">{dayLabel(p.date)}</td>
                  <td className="py-2 pr-4 text-paper">{s.name}</td>
                  <td className="tnum py-2 pr-4 text-paper">
                    {formatMeasurement(p.value, s.decimals)} {s.unit}
                  </td>
                  <td className="tnum py-2 text-paper">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={frameRef} className="relative mt-4" style={{ height: HEIGHT }}>
          {width > 0 ? (
            <>
              <svg width={width} height={HEIGHT} role="img" aria-labelledby={titleId} className="block">
                {/* Hairline, solid, recessive gridlines; the baseline is one step stronger. */}
                {yTicks.map((tick) => (
                  <g key={tick}>
                    <line
                      x1={MARGIN.left}
                      x2={MARGIN.left + plotW}
                      y1={y(tick)}
                      y2={y(tick)}
                      stroke={tick === 0 ? "var(--edge-strong)" : "var(--edge)"}
                      strokeWidth={1}
                    />
                    <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)" className="tnum">
                      {tick}
                    </text>
                  </g>
                ))}
                {monthTicks(domain.from, domain.to).map((tick) => (
                  <text key={tick.t} x={x(tick.t)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                    {tick.label}
                  </text>
                ))}

                {activeDate ? (
                  <line
                    x1={x(asTime(activeDate))}
                    x2={x(asTime(activeDate))}
                    y1={MARGIN.top}
                    y2={MARGIN.top + plotH}
                    stroke="var(--edge-strong)"
                    strokeWidth={1}
                  />
                ) : null}

                {/* The spotlighted line is drawn last, so nothing sits on top of it. */}
                {[...selected].sort((a, b) => Number(a.id === spotlight) - Number(b.id === spotlight)).map((s) => {
                  const { color, dashed } = styleOf(slots[s.id]);
                  return (
                    <g key={s.id} opacity={muted(s.id) ? 0.14 : 1} className="transition-opacity duration-150">
                      <path
                        d={s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(asTime(p.date)).toFixed(1)},${y(p.points).toFixed(1)}`).join(" ")}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap={dashed ? "butt" : "round"}
                        strokeDasharray={dashed ? "6 4" : undefined}
                      />
                      {/* 8px dots with a 2px ring in the card color, so they stay clear where lines cross. */}
                      {s.points.map((p, i) => {
                        const r = p.date === activeDate ? 6 : 5;
                        const common = { fill: color, stroke: "var(--raise)", strokeWidth: 2 };
                        return dashed ? (
                          <rect key={`${p.date}-${i}`} x={x(asTime(p.date)) - r + 0.5} y={y(p.points) - r + 0.5} width={2 * r - 1} height={2 * r - 1} rx={1.5} {...common} />
                        ) : (
                          <circle key={`${p.date}-${i}`} cx={x(asTime(p.date))} cy={y(p.points)} r={r} {...common} />
                        );
                      })}
                    </g>
                  );
                })}

                {endLabels.map((l) => (
                  <g key={l.id} opacity={muted(l.id) ? 0.3 : 1} className="transition-opacity duration-150">
                    <line
                      x1={l.x + 8}
                      x2={l.x + 18}
                      y1={l.y}
                      y2={l.y}
                      stroke={styleOf(l.slot).color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray={styleOf(l.slot).dashed ? "4 3" : undefined}
                    />
                    <text x={l.x + 22} y={l.y + 4} fontSize={11} fill="var(--color-paper)">
                      {l.name.length > 16 ? `${l.name.slice(0, 15)}…` : l.name}
                    </text>
                  </g>
                ))}

                {/* The hit area is the whole plot, not the dots: the pointer only has to be
                    near a date, and the crosshair snaps to it. */}
                <rect
                  x={MARGIN.left}
                  y={MARGIN.top}
                  width={plotW}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="group"
                  aria-label="Chart. Use the left and right arrow keys to step through the dates."
                  onPointerMove={(e) => setActive(nearestDate(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
                  onPointerLeave={() => setActive(null)}
                  onKeyDown={onKeyDown}
                  onBlur={() => setActive(null)}
                  className="outline-none focus-visible:stroke-[var(--color-accent)]"
                  stroke="transparent"
                  strokeWidth={2}
                />
              </svg>

              {activeDate ? (
                <div
                  role="status"
                  className="pointer-events-none absolute top-2 z-10 w-56 rounded-lg border border-[var(--edge-strong)] bg-ink px-3 py-2 shadow-lg"
                  style={tipFlip ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
                >
                  <p className="text-xs text-muted">{dayLabel(activeDate)}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {readout.map(({ s, point, exact }) => (
                      <li key={s.id} className={["flex items-start gap-2 transition-opacity", muted(s.id) ? "opacity-40" : ""].join(" ")}>
                        <SeriesKey slot={slots[s.id]} className="mt-1" />
                        <div className="min-w-0 text-xs">
                          <p className="truncate text-muted">{s.name}</p>
                          {point ? (
                            <p className="tnum text-sm font-semibold text-paper">
                              {formatMeasurement(point.value, s.decimals)} {s.unit}
                              <span className="ml-1.5 text-xs font-normal text-muted">
                                {point.points} pts{exact ? "" : ` · ${dayLabel(point.date, false)}`}
                              </span>
                            </p>
                          ) : (
                            <p className="text-muted">No attempts yet</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
