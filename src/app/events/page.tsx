import Link from "next/link";
import { DayTag, EmptyState, PageHeader } from "@/components/ui";
import { getEventSummaries } from "@/lib/queries";
import { describeScale, formatMeasurement, isLowerBetter } from "@/lib/scoring";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const events = await getEventSummaries();
  const byDay = SITE.days.map((day) => ({
    ...day,
    events: events.filter((e) => e.day === day.day),
  }));
  const orphans = events.filter((e) => !SITE.days.some((d) => d.day === e.day));

  return (
    <>
      <PageHeader
        eyebrow={`${events.length} events · two days`}
        title="Events"
        description="Each event sets two benchmarks: the performance worth 1000 points and the one worth 0. Everything in between is a straight line, so a fast sprint and a long throw are worth comparing."
      />

      {events.length === 0 ? (
        <EmptyState title="No events yet">
          Run <code className="text-accent">npm run db:seed</code> to load the schedule.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {[...byDay, ...(orphans.length ? [{ day: 0, label: "Unscheduled", date: "", events: orphans }] : [])]
            .filter((group) => group.events.length > 0)
            .map((group) => (
              <section key={group.label}>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="font-display text-xl font-bold uppercase tracking-wide text-paper">
                    {group.label}
                  </h2>
                  {group.date ? (
                    <span className="text-xs text-muted">
                      {new Date(`${group.date}T12:00:00`).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>

                <ul className="grid gap-3 md:grid-cols-2">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/events/${event.slug}`}
                        className="card block h-full p-4 transition-colors hover:border-accent/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-paper">
                            {event.name}
                          </h3>
                          <DayTag day={event.day} />
                        </div>

                        {event.description ? (
                          <p className="mt-1.5 text-sm text-muted">{event.description}</p>
                        ) : null}

                        <p className="tnum mt-3 text-xs text-muted">
                          {describeScale(event, event.decimals, event.unitLabel)}
                          <span className="ml-2 text-muted/70">
                            ({isLowerBetter(event) ? "lower is better" : "higher is better"})
                          </span>
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--edge)] pt-3">
                          {event.leaderName ? (
                            <p className="truncate text-sm">
                              <span className="text-muted">Leader </span>
                              <span className="font-semibold text-paper">{event.leaderName}</span>
                              <span className="tnum ml-2 text-muted">
                                {formatMeasurement(event.leaderRaw ?? 0, event.decimals)}
                                {event.unitLabel ? ` ${event.unitLabel}` : ""}
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-muted">Not contested yet</p>
                          )}
                          <span className="tnum shrink-0 text-xs text-muted">
                            {event.resultCount} {event.resultCount === 1 ? "score" : "scores"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
