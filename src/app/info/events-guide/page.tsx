import Link from "next/link";
import { DevNotes } from "@/components/DevNotes";
import { EventGuide } from "@/components/EventGuide";
import { EmptyState, PageHeader } from "@/components/ui";
import { mediaProblem } from "@/lib/profiles";
import { buildGuideEvents } from "@/lib/eventGuide";
import { isLocalDev, publicFileMissing } from "@/lib/publicFiles";
import { getEventsForForm } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Event Guide" };

export default async function EventGuidePage(props: PageProps<"/info/events-guide">) {
  const [events, params] = await Promise.all([getEventsForForm(), props.searchParams]);
  const { guideEvents, rows, unmatched, duplicates } = buildGuideEvents(events);

  // Open on the tab in ?event=, falling back to the first event.
  const wanted = Array.isArray(params.event) ? params.event[0] : params.event;
  const initialSlug = guideEvents.find((e) => e.slug === wanted)?.slug ?? guideEvents[0]?.slug ?? "";

  const notes = isLocalDev
    ? [
        ...unmatched.map((g) => `"${g.slug}" matches no event. Check it against the address of the event's page.`),
        ...duplicates.map((g) => `"${g.slug}" has more than one entry; only the first is used.`),
        ...rows.flatMap(({ event, guide }) => {
          const media = guide?.media;
          if (!media) return [];
          const problems: string[] = [];
          const problem = mediaProblem(media);
          if (problem) problems.push(`${event.slug}: media ${problem}`);
          if (publicFileMissing(media.src)) problems.push(`${event.slug}: no file at public${media.src}.`);
          if (publicFileMissing(media.poster)) problems.push(`${event.slug}: no file at public${media.poster}.`);
          return problems;
        }),
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={`${guideEvents.length} events · two days`}
        title="Event Guide"
        description="What each event is, how it's scored, and how it's done."
        actions={
          <Link href="/events" className="btn btn-ghost">
            Live standings
          </Link>
        }
      />

      <DevNotes file="src/content/events.ts" notes={notes} />

      {guideEvents.length === 0 ? (
        <EmptyState title="No events yet">Events appear here once the schedule is loaded.</EmptyState>
      ) : (
        <EventGuide events={guideEvents} initialSlug={initialSlug} />
      )}
    </>
  );
}
