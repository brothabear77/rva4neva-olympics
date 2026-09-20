"use client";

import { useState } from "react";
import Link from "next/link";
import { RankBadge } from "./ui";
import { formatMeasurement } from "@/lib/scoring";
import type { LeaderboardEntry } from "@/lib/queries";
import type { Event } from "@/lib/schema";

/**
 * Standings, with each athlete's per-event breakdown available on tap.
 *
 * The breakdown lives in an expandable row rather than extra columns: with ten
 * events there is no width on a phone for a full matrix, and the question
 * people actually ask is "where did *I* lose ground", one athlete at a time.
 */
export function LeaderboardTable({
  entries,
  events,
}: {
  entries: LeaderboardEntry[];
  events: Event[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const topScore = entries[0]?.totalPoints ?? 0;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Overall standings, highest total points first
        </caption>
        <thead>
          <tr className="border-b border-[var(--edge)]">
            <th scope="col" className="eyebrow px-4 py-3">Rank</th>
            <th scope="col" className="eyebrow px-2 py-3">Athlete</th>
            <th scope="col" className="eyebrow hidden px-2 py-3 text-right sm:table-cell">Events</th>
            <th scope="col" className="eyebrow px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isOpen = expanded === entry.athleteId;
            const share = topScore > 0 ? (entry.totalPoints / topScore) * 100 : 0;

            return [
              <tr
                key={entry.athleteId}
                className="border-b border-[var(--edge)] last:border-0 hover:bg-surface/30"
              >
                <td className="px-4 py-3">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.athleteId)}
                    aria-expanded={isOpen}
                    className="group block w-full text-left"
                  >
                    <span className="font-display text-base font-semibold uppercase tracking-wide text-paper group-hover:text-accent">
                      {entry.athleteName}
                    </span>
                    <span className="mt-1 block text-xs text-muted sm:hidden">
                      {entry.eventsCompleted} of {events.length} events
                    </span>
                    {/* Relative bar: how close the field is to the leader. */}
                    <span className="mt-1.5 block h-1 w-full max-w-48 overflow-hidden rounded-full bg-surface/60">
                      <span
                        className="block h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.max(share, entry.totalPoints > 0 ? 3 : 0)}%` }}
                      />
                    </span>
                  </button>
                </td>
                <td className="tnum hidden px-2 py-3 text-right text-sm text-muted sm:table-cell">
                  {entry.eventsCompleted}
                  <span className="text-muted/60">/{events.length}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={[
                      "tnum font-display text-xl font-bold",
                      entry.rank === 1 && entry.totalPoints > 0 ? "text-accent" : "text-paper",
                    ].join(" ")}
                  >
                    {entry.totalPoints.toLocaleString()}
                  </span>
                </td>
              </tr>,

              isOpen ? (
                <tr key={`${entry.athleteId}-detail`} className="border-b border-[var(--edge)]">
                  <td colSpan={4} className="bg-ink/60 px-4 py-4">
                    <p className="eyebrow mb-3">{entry.athleteName} — event by event</p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {events.map((event) => {
                        const result = entry.byEventId[event.id];
                        return (
                          <li
                            key={event.id}
                            className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--edge)] px-3 py-2"
                          >
                            <Link
                              href={`/events/${event.slug}`}
                              className="truncate text-sm text-paper hover:text-accent"
                            >
                              {event.name}
                            </Link>
                            {result ? (
                              <span className="tnum shrink-0 text-right text-sm">
                                <span className="font-semibold text-accent">{result.points}</span>
                                <span className="ml-2 text-xs text-muted">
                                  {formatMeasurement(result.rawValue, event.decimals)}
                                  {event.unitLabel ? ` ${event.unitLabel}` : ""}
                                </span>
                              </span>
                            ) : (
                              <span className="shrink-0 text-xs text-muted">Not yet scored</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
