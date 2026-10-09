import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession, isAdmin, isMember } from "@/lib/auth";
import { showVlogPage } from "@/lib/flags";
import { VlogFeed } from "@/components/VlogFeed";
import { VlogUploadForm } from "@/components/VlogUploadForm";
import { getEventsForForm } from "@/lib/queries";
import { getVlogItems } from "@/lib/vlogFeed";
import { vlogMediaConfigured } from "@/lib/vlogMedia";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vlog" };

/** The page for sharing videos, behind the "show-vlog-page" feature flag. */
export default async function VlogPage() {
  // Behind the "show-vlog-page" flag: while it's off the page doesn't exist for anyone,
  // so this comes before the sign-in check.
  if (!(await showVlogPage())) redirect("/");

  const session = await getSession();
  if (!session) redirect("/login?next=/athletes/vlog");
  if (!isMember(session)) redirect("/");

  const configured = vlogMediaConfigured();
  const items = configured ? await getVlogItems({ athleteId: session.athleteId, isAdmin: isAdmin(session) }) : [];
  const eventOptions = (await getEventsForForm()).map((event) => ({ id: event.id, name: event.name }));

  return (
    <>
      <PageHeader
        eyebrow="Athletes"
        title="Vlog"
        description="Share training clips, attempts and highlights with the group."
      />

      {/* Closed by default: most visits are for watching, so the form stays out of the way until asked for. */}
      <details className="group reveal mb-10">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-paper">Upload a video</h2>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-6 w-6 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className="pt-4">
          <VlogUploadForm
            enabled={configured}
            canUpload={session.athleteId !== null}
            events={eventOptions}
          />
        </div>
      </details>

      <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">Videos</h2>
      {items.length > 0 ? (
        <VlogFeed items={items} canHeart={session.athleteId !== null} />
      ) : (
        <EmptyState title="No videos yet">Be the first to share a clip.</EmptyState>
      )}
    </>
  );
}
