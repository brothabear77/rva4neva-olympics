import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { QuoteCarousel } from "@/components/QuoteCarousel";
import { LiveRefresh } from "@/components/LiveRefresh";
import { RankBadge } from "@/components/ui";
import { QUOTES } from "@/content/quotes";
import { getEventSummaries, getLeaderboard, getRecentResults } from "@/lib/queries";
import { cleanQuotes } from "@/lib/quotes";
import { formatMeasurement } from "@/lib/scoring";
import { SITE, hasStarted } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Until kickoff the homepage is only the title and the countdown. Returning
  // before any query also means it renders without touching the database.
  if (!hasStarted()) {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-10 text-center">
        <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-[0.02em] text-paper sm:text-8xl">
          <span className="normal-case">#rva<span className="text-accent">4</span>neva</span>
          <br />
          Olympics
        </h1>
        <Countdown startsAt={SITE.startsAt} large />
        {/* Renders nothing until src/content/quotes.ts has a quote in it. */}
        <QuoteCarousel quotes={cleanQuotes(QUOTES)} />
      </section>
    );
  }

  const [entries, events, recent] = await Promise.all([
    getLeaderboard(),
    getEventSummaries(),
    getRecentResults(8),
  ]);

  const podium = entries.filter((e) => e.eventsCompleted > 0).slice(0, 3);
  const scored = events.filter((e) => e.resultCount > 0).length;

  return (
    <div className="space-y-12">
      <section className="card relative overflow-hidden p-6 sm:p-10">
        {/* A single wash of the accent so the hero reads as the loudest thing
            on the site without introducing a sixth color. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />
        <p className="eyebrow">{SITE.tagline}</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase leading-[0.95] tracking-[0.02em] text-paper sm:text-6xl">
          <span className="normal-case">#rva<span className="text-accent">4</span>neva</span>
          <br />
          Olympics
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted">
          Eleven events across two days. Every result converts to points on a
          decathlon-style scale, so the sprint and the trivia round count toward
          the same total.
        </p>

        <div className="mt-8">
          <Countdown startsAt={SITE.startsAt} />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/leaderboard" className="btn">
            See the standings
          </Link>
          <Link href="/submit" className="btn btn-ghost">
            Submit a result
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-paper">
            Podium
          </h2>
          <Link href="/leaderboard" className="text-xs text-muted hover:text-accent">
            Full leaderboard →
          </Link>
        </div>

        {podium.length === 0 ? (
          <p className="card p-6 text-sm text-muted">
            No results yet.{" "}
            <Link href="/submit" className="text-accent underline underline-offset-4">
              Post the first score
            </Link>{" "}
            and the podium fills in.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {podium.map((entry) => (
              <li key={entry.athleteId} className="card p-4">
                <div className="flex items-center gap-3">
                  <RankBadge rank={entry.rank} />
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-paper">
                      {entry.athleteName}
                    </p>
                    <p className="tnum text-sm text-accent">
                      {entry.totalPoints.toLocaleString()} pts
                    </p>
                  </div>
                </div>
                {entry.best ? (
                  <p className="mt-3 truncate border-t border-[var(--edge)] pt-3 text-xs text-muted">
                    Best event: {entry.best.eventName} ({entry.best.points} pts)
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-paper">
            Latest results
          </h2>
          <LiveRefresh intervalMs={15_000} />
        </div>

        {recent.length === 0 ? (
          <p className="card p-6 text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="card divide-y divide-[var(--edge)]">
            {recent.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-paper">
                    <span className="font-semibold">{row.athleteName}</span>
                    <span className="text-muted"> in </span>
                    <Link href={`/events/${row.eventSlug}`} className="hover:text-accent">
                      {row.eventName}
                    </Link>
                  </p>
                  <p className="tnum mt-0.5 text-xs text-muted">
                    {formatMeasurement(row.rawValue, row.eventDecimals)}
                    {row.eventUnit ? ` ${row.eventUnit}` : ""}
                    {row.submittedBy ? ` · posted by ${row.submittedBy}` : ""}
                  </p>
                </div>
                <span className="tnum shrink-0 font-display text-lg font-bold text-accent">
                  {row.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-paper">
            The schedule
          </h2>
          <Link href="/events" className="text-xs text-muted hover:text-accent">
            All events →
          </Link>
        </div>
        <p className="mb-4 text-sm text-muted">
          {scored} of {events.length} events have scores in.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.slug}`}
                className="card flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:border-accent/50"
              >
                <span className="truncate text-sm text-paper">{event.name}</span>
                <span className="eyebrow shrink-0">Day {event.day}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
