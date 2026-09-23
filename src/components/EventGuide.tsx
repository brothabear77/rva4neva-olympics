"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EventMedia } from "./EventMedia";
import { DayTag } from "./ui";
import type { LadderStep, ResolvedMedia } from "@/lib/profiles";

export interface GuideEvent {
  id: string;
  slug: string;
  name: string;
  day: number;
  unitLabel: string;
  /** The written summary, or the event's own description when none was written. */
  summary: string;
  rules: string[];
  media: ResolvedMedia | null;
  /** Null when the event's two benchmarks are equal and it has no scale yet. */
  scale: { top: string; zero: string; ladder: LadderStep[] } | null;
}

/**
 * The event guide: a tab per event, switching on the page with no reload.
 *
 * The page arrives already showing the right tab (from ?event=), so a shared link
 * opens where it should. Choosing a tab then rewrites the address with
 * replaceState rather than pushing history, so Back leaves the guide instead of
 * stepping backwards through every tab that was looked at.
 */
export function EventGuide({ events, initialSlug }: { events: GuideEvent[]; initialSlug: string }) {
  const pathname = usePathname();
  const [selected, setSelected] = useState(initialSlug);
  const listRef = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<string, HTMLButtonElement>());

  const current = events.find((e) => e.slug === selected) ?? events[0];

  const select = (slug: string, focus = false) => {
    setSelected(slug);
    window.history.replaceState(null, "", `${pathname}?event=${encodeURIComponent(slug)}`);
    if (focus) tabs.current.get(slug)?.focus();
  };

  // On a phone the tab strip scrolls sideways. Keep the chosen tab in view by
  // moving the strip itself, not the page (scrollIntoView could jump the page).
  useEffect(() => {
    const list = listRef.current;
    const tab = tabs.current.get(current.slug);
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2 });
  }, [current.slug]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = events.findIndex((ev) => ev.slug === current.slug);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (at + 1) % events.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + events.length) % events.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = events.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(events[next].slug, true);
  };

  return (
    <div>
      {/* One row that scrolls sideways on a phone; wraps into rows where there is room. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Events"
        onKeyDown={onKeyDown}
        className="relative flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {events.map((event) => {
          const on = event.slug === current.slug;
          return (
            <button
              key={event.id}
              ref={(node) => {
                if (node) tabs.current.set(event.slug, node);
                else tabs.current.delete(event.slug);
              }}
              type="button"
              role="tab"
              id={`tab-${event.slug}`}
              aria-selected={on}
              aria-controls={`panel-${event.slug}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(event.slug)}
              className={[
                "shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 text-left transition-colors",
                on
                  ? "border-accent bg-accent text-ink"
                  : "border-[var(--edge-strong)] text-paper hover:border-accent/60",
              ].join(" ")}
            >
              <span className={["eyebrow block", on ? "!text-ink/70" : ""].join(" ")}>Day {event.day}</span>
              <span className="block font-display text-sm font-semibold uppercase tracking-wide">{event.name}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${current.slug}`}
        aria-labelledby={`tab-${current.slug}`}
        tabIndex={0}
        className="mt-8 outline-offset-8"
      >
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-paper sm:text-4xl">
            {current.name}
          </h2>
          <DayTag day={current.day} />
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-8">
            <section>
              <h3 className="eyebrow mb-2">What it is</h3>
              {current.summary ? (
                <p className="text-base leading-relaxed text-paper">{current.summary}</p>
              ) : (
                <p className="text-sm text-muted">A description is coming soon.</p>
              )}
              {current.rules.length > 0 ? (
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-paper marker:text-muted">
                  {current.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section>
              <h3 className="eyebrow mb-2">How it&apos;s scored</h3>
              {current.scale ? (
                <>
                  <p className="text-sm leading-relaxed text-muted">
                    Points run in a straight line between two marks. Beating the top mark
                    scores over 100, and nothing scores below 0.
                  </p>

                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div className="card p-3">
                      <dt className="eyebrow">Worth 100 points</dt>
                      <dd className="tnum mt-1 font-display text-2xl font-bold text-accent">{current.scale.top}</dd>
                    </div>
                    <div className="card p-3">
                      <dt className="eyebrow">Worth 0 points</dt>
                      <dd className="tnum mt-1 font-display text-2xl font-bold text-paper">{current.scale.zero}</dd>
                    </div>
                  </dl>

                  <table className="mt-4 w-full max-w-sm border-collapse text-left text-sm">
                    <caption className="sr-only">Example marks and the points they earn</caption>
                    <thead>
                      <tr className="border-b border-[var(--edge)]">
                        <th scope="col" className="eyebrow py-2">Mark</th>
                        <th scope="col" className="eyebrow py-2 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.scale.ladder.map((step) => (
                        <tr key={step.points} className="border-b border-[var(--edge)] last:border-0">
                          <td className="tnum py-2 text-paper">{step.mark}</td>
                          <td className="tnum py-2 text-right font-semibold text-paper">{step.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-sm text-muted">This event&apos;s scoring scale hasn&apos;t been set yet.</p>
              )}
            </section>
          </div>

          <div>
            <h3 className="eyebrow mb-2">Demonstration</h3>
            {/* Keyed by event so a YouTube player that was started does not carry over to the next tab. */}
            <EventMedia key={current.slug} media={current.media} />
            <Link
              href={`/events/${current.slug}`}
              className="mt-4 inline-block text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
            >
              See the live standings for {current.name} &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
