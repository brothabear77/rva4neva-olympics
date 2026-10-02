import Image from "next/image";
import Link from "next/link";
import { Champion } from "@/components/Champion";
import { Confetti } from "@/components/Confetti";
import { Countdown } from "@/components/Countdown";
import { QuoteCarousel } from "@/components/QuoteCarousel";
import { LiveRefresh } from "@/components/LiveRefresh";
import { RankBadge } from "@/components/ui";
import { ATHLETE_PROFILES } from "@/content/athletes";
import { QUOTES } from "@/content/quotes";
import { getEventSummaries, getLeaderboard, getRecentResults, getWalkoutSongs } from "@/lib/queries";
import { mergeAthleteProfiles } from "@/lib/profiles";
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
        <Image src="/rva4nevaoly.svg" alt="#rva4neva Olympics" width={280} height={280} priority unoptimized className="h-auto w-40 sm:w-56" />
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
  // Every athlete has a result in every event: there's nothing left to submit.
  const possibleResults = entries.length * events.length;
  const allScoresIn = possibleResults > 0 && entries.every((e) => e.eventsCompleted === events.length);

  // Tiebreakers mean rank 1 is a single athlete, not a shared place — but Champion
  // still takes a list rather than one entry, so a scoring change that brought
  // ties back wouldn't silently drop a co-champion from the page.
  const championRows = allScoresIn
    ? mergeAthleteProfiles(
        entries.map((e) => ({
          name: e.athleteName,
          athleteId: e.athleteId,
          totalPoints: e.totalPoints,
          rank: e.rank,
        })),
        ATHLETE_PROFILES,
      ).rows.filter((r) => r.athlete.rank === 1)
    : [];

  // Only looked up once there's a champion to look it up for.
  const championWalkouts = championRows.length > 0 ? await getWalkoutSongs() : null;
  const champions = championRows.map((r) => ({
    athleteId: r.athlete.athleteId,
    athleteName: r.athlete.name,
    totalPoints: r.athlete.totalPoints,
    photo: r.profile?.photo,
    walkout: championWalkouts?.get(r.athlete.athleteId) ?? null,
  }));

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
        {/* Falls over the whole hero, not just the Champion card, once there is one. */}
        {champions.length > 0 ? <Confetti /> : null}

        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          {/* Centered as a block at every width, not just below lg where the quote
              carousel wraps underneath instead of sitting beside it. */}
          <div className="min-w-0 text-center lg:max-w-md">
            <p className="eyebrow">{SITE.tagline}</p>
            {/* Tailwind's preflight makes img block-level, so text-center on the
                wrapper doesn't move it — it needs its own centering. */}
            <Image src="/rva4nevaoly.svg" alt="#rva4neva Olympics" width={168} height={168} priority unoptimized className="mx-auto mt-3 h-auto w-16 sm:w-24" />

            <div className="mt-8 flex justify-center">
              <Countdown startsAt={SITE.startsAt} finished={allScoresIn} />
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Link href="/leaderboard" className="btn">
                See the standings
              </Link>
              <Link href="/submit" className="btn btn-ghost">
                Submit a result
              </Link>
            </div>
          </div>

          {/* The open space beside the countdown on wider screens: the champion once
              every result is in, the quote carousel until then (which renders nothing
              itself until src/content/quotes.ts has a quote in it). */}
          <div
            className={[
              "my-6 flex justify-center lg:my-10 lg:flex-1",
              champions.length > 0 ? "lg:justify-center" : "lg:justify-end",
            ].join(" ")}
          >
            {champions.length > 0 ? (
              <Champion champions={champions} />
            ) : (
              <QuoteCarousel quotes={cleanQuotes(QUOTES)} compact />
            )}
          </div>
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
                <p className="min-w-0 truncate text-sm text-paper">
                  <span className="font-semibold">{row.athleteName}</span>
                  <span className="text-muted"> in </span>
                  <Link href={`/events/${row.eventSlug}`} className="hover:text-accent">
                    {row.eventName}
                  </Link>
                </p>
                {/* "23.0 m | 92 pts": the raw measurement for context, the score for weight. */}
                <span className="tnum shrink-0 whitespace-nowrap text-sm text-muted">
                  {formatMeasurement(row.rawValue, row.eventDecimals)}
                  {row.eventUnit ? ` ${row.eventUnit}` : ""}
                  <span className="mx-1.5">|</span>
                  <span className="font-display text-lg font-bold text-accent">{row.points}</span> pts
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
