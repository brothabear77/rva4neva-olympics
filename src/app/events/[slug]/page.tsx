import Link from "next/link";
import { notFound } from "next/navigation";
import { BenchmarkForm } from "@/components/BenchmarkForm";
import { DeleteResultButton } from "@/components/DeleteResultButton";
import { DayTag, EmptyState, PageHeader, RankBadge, Stat } from "@/components/ui";
import { getEventBySlug, getEventResults } from "@/lib/queries";
import { describeScale, formatMeasurement } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const event = await getEventBySlug(slug);
  return { title: event?.name ?? "Event" };
}

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const rows = await getEventResults(event.id);
  const best = rows[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow={`Day ${event.day} event`}
        title={event.name}
        description={event.description || undefined}
        actions={
          <>
            <Link href={`/info/events-guide?event=${event.slug}`} className="btn btn-ghost">
              Rules &amp; demo
            </Link>
            <Link href="/submit" className="btn">
              Submit a score
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <DayTag day={event.day} />
        <span className="eyebrow rounded border border-[var(--edge)] px-2 py-1">
          Measured in {event.unitLabel || "units"}
        </span>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Event leader"
          value={best?.athleteName ?? "—"}
          hint={best ? `${best.points} points` : "No scores yet"}
          emphasis
        />
        <Stat
          label="Best mark"
          value={
            best
              ? `${formatMeasurement(best.rawValue, event.decimals)}${event.unitLabel ? ` ${event.unitLabel}` : ""}`
              : "—"
          }
        />
        <Stat label="Scores recorded" value={rows.length} />
      </div>

      <div className="card mb-6 p-4">
        <p className="eyebrow">Scoring scale</p>
        <p className="tnum mt-1 text-sm text-paper">
          {describeScale(event, event.decimals, event.unitLabel)}
        </p>
        <p className="mt-2 text-xs text-muted">
          Points run in a straight line between the two marks, and beating the top
          mark scores above 100.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nobody has contested this yet">
          <Link href="/submit" className="text-accent underline underline-offset-4">
            Post the first score
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{event.name} results, best first</caption>
            <thead>
              <tr className="border-b border-[var(--edge)]">
                <th scope="col" className="eyebrow px-4 py-3">#</th>
                <th scope="col" className="eyebrow px-2 py-3">Athlete</th>
                <th scope="col" className="eyebrow px-2 py-3 text-right">Mark</th>
                <th scope="col" className="eyebrow px-2 py-3 text-right">Points</th>
                <th scope="col" className="eyebrow px-4 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b border-[var(--edge)] last:border-0">
                  <td className="px-4 py-3">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="px-2 py-3">
                    <span className="font-display text-base font-semibold uppercase tracking-wide text-paper">
                      {row.athleteName}
                    </span>
                    {row.notes ? (
                      <span className="mt-0.5 block text-xs text-muted">{row.notes}</span>
                    ) : null}
                    {row.submittedBy ? (
                      <span className="mt-0.5 block text-xs text-muted/70">
                        posted by {row.submittedBy}
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-2 py-3 text-right text-sm text-paper">
                    {formatMeasurement(row.rawValue, event.decimals)}
                    {event.unitLabel ? (
                      <span className="text-muted"> {event.unitLabel}</span>
                    ) : null}
                  </td>
                  <td className="tnum px-2 py-3 text-right">
                    <span
                      className={[
                        "font-display text-lg font-bold",
                        index === 0 ? "text-accent" : "text-paper",
                      ].join(" ")}
                    >
                      {row.points}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteResultButton resultId={row.id} athleteName={row.athleteName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 border-t border-[var(--edge)] pt-6">
        <BenchmarkForm event={event} sampleRaw={best?.rawValue ?? null} resultCount={rows.length} />
      </div>
    </>
  );
}
