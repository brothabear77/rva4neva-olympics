import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAttemptButton } from "@/components/DeleteAttemptButton";
import { PracticeLogForm } from "@/components/PracticeLogForm";
import { ProgressChart, type ChartSeries } from "@/components/ProgressChart";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { getSession, isMember } from "@/lib/auth";
import { bestAttempt } from "@/lib/practice";
import { getAthletes, getEventsForForm, getPracticeAttempts } from "@/lib/queries";
import { describeScale, formatMeasurement, scoreResult } from "@/lib/scoring";
import { todayInEventZone } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Oct 6, 2026" for a stored calendar date. Noon UTC keeps the day from slipping. */
const formatDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/**
 * Your practice attempts at each event. Private: an athlete sees only their own. The
 * admin, who has none, looks at anyone's with ?athlete=<id>.
 */
export default async function ProgressPage(props: PageProps<"/athletes/progress">) {
  const session = await getSession();
  if (!session) redirect("/login?next=/athletes/progress");
  if (!isMember(session)) redirect("/");

  const asked = (await props.searchParams).athlete;
  const requested = typeof asked === "string" && UUID.test(asked) ? asked : null;
  // Not isAdmin(session): as a type guard it would narrow `session` to never in the other branch.
  const admin = session.role === "admin";
  const athleteId = admin ? requested : session.athleteId;
  const own = athleteId !== null && athleteId === session.athleteId;

  const roster = admin ? await getAthletes() : [];
  const viewed = roster.find((a) => a.id === athleteId);

  if (!athleteId || (admin && !viewed && !own)) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Progress" description="Pick an athlete to see their practice log." />
        <div className="card divide-y divide-[var(--edge)]">
          {roster.map((a) => (
            <Link key={a.id} href={`/athletes/progress?athlete=${a.id}`} className="block px-4 py-3 text-paper hover:bg-surface/50">
              {a.name}
            </Link>
          ))}
        </div>
      </>
    );
  }

  const [events, attempts] = await Promise.all([getEventsForForm(), getPracticeAttempts(athleteId)]);
  const byEvent = Map.groupBy(attempts, (a) => a.eventId);
  const logged = events.filter((e) => byEvent.has(e.id));

  // One line per event that has attempts, oldest first, each scored as it would be at the games.
  const chartSeries: ChartSeries[] = logged.map((event) => ({
    id: event.id,
    name: event.name,
    unit: event.unitLabel,
    decimals: event.decimals,
    points: [...(byEvent.get(event.id) ?? [])]
      .sort((a, b) => (a.attemptedOn < b.attemptedOn ? -1 : a.attemptedOn > b.attemptedOn ? 1 : 0))
      .map((a) => ({ date: a.attemptedOn, value: a.rawValue, points: scoreResult(a.rawValue, event) })),
  }));
  // Start with the three events logged most, so the chart opens on something worth reading.
  const defaultIds = [...chartSeries]
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 3)
    .map((s) => s.id);

  return (
    <>
      <PageHeader
        eyebrow={own ? "Only you can see this" : `Viewing ${viewed?.name ?? "athlete"} as admin`}
        title="Progress"
        description="Log your attempts at each event through the year, and watch your best get better."
        actions={
          admin ? (
            <Link href="/athletes/progress" className="btn btn-ghost">
              All athletes
            </Link>
          ) : null
        }
      />

      {chartSeries.length > 0 ? (
        <section aria-labelledby="chart-heading" className="mb-10">
          <h2 id="chart-heading" className="sr-only">
            Your attempts over time
          </h2>
          <ProgressChart series={chartSeries} defaultIds={defaultIds} />
        </section>
      ) : null}

      {own ? (
        <section aria-labelledby="log-heading" className="mb-10">
          <h2 id="log-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
            Log an attempt
          </h2>
          <PracticeLogForm
            events={events.map((e) => ({ id: e.id, name: e.name, unitLabel: e.unitLabel, decimals: e.decimals }))}
            today={todayInEventZone()}
          />
        </section>
      ) : null}

      <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">By event</h2>
      {logged.length === 0 ? (
        <EmptyState title="No attempts yet">Log your first one above and it will show up here.</EmptyState>
      ) : (
        <div className="space-y-6">
          {logged.map((event) => {
            const list = byEvent.get(event.id) ?? [];
            const best = bestAttempt(list, event);
            return (
              <section key={event.id} className="card p-4 sm:p-6">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-paper">{event.name}</h3>
                <p className="mt-1 text-xs text-muted">{describeScale(event, event.decimals, event.unitLabel)}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="Best"
                    emphasis
                    value={best ? `${formatMeasurement(best.attempt.rawValue, event.decimals)} ${event.unitLabel}` : "—"}
                    hint={best ? formatDay(best.attempt.attemptedOn) : undefined}
                  />
                  <Stat label="Worth" value={best ? `${best.points} pts` : "—"} hint="If scored at the games" />
                  <Stat label="Attempts" value={list.length} />
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted hover:text-paper">History</summary>
                  <ul className="mt-3 divide-y divide-[var(--edge)]">
                    {list.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span className="tnum text-paper">
                          {formatMeasurement(a.rawValue, event.decimals)} {event.unitLabel}
                        </span>
                        <span className="text-muted">{formatDay(a.attemptedOn)}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">{a.notes}</span>
                        <DeleteAttemptButton attemptId={a.id} />
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
