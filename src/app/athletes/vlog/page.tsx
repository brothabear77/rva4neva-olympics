import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession, isAdmin, isMember } from "@/lib/auth";
import { showVlogPage } from "@/lib/flags";
import { VlogFeed } from "@/components/VlogFeed";
import { VlogGrid } from "@/components/VlogGrid";
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

  const canUpload = session.role === "athlete" && session.athleteId !== null;
  const configured = vlogMediaConfigured();
  const viewer = { athleteId: session.athleteId, isAdmin: isAdmin(session) };
  const items = configured ? (await getVlogItems(viewer)).items : [];
  const confessions = configured ? await getVlogItems(viewer, true) : null;
  const eventOptions = (await getEventsForForm()).map((event) => ({ id: event.id, name: event.name }));

  return (
    <>
      <PageHeader
        eyebrow="Athletes"
        title="Vlog"
        description="Share training clips, attempts and highlights with the group."
      />

      {/* Athletes only: the admin and scorekeeper accounts can watch but not upload. */}
      {canUpload ? (
        <>
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
              <VlogUploadForm enabled={configured} canUpload events={eventOptions} />
            </div>
          </details>
        </>
      ) : null}

      <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">Videos</h2>
      {items.length > 0 ? (
        <VlogFeed items={items} canHeart={session.athleteId !== null} />
      ) : (
        <EmptyState title="No videos yet">Be the first to share a clip.</EmptyState>
      )}

      {confessions ? (
        <section className="mt-12">
          <h2 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-paper">Confessions</h2>
          {confessions.isPublic ? null : <p className="mb-4 text-sm text-muted">Only you can see your own confessions.</p>}
          {confessions.items.length > 0 ? (
            <VlogGrid items={confessions.items} canHeart={session.athleteId !== null && confessions.isPublic} />
          ) : (
            <EmptyState title="No confessions yet">
              Pick &ldquo;Confession&rdquo; as the event when you upload one.
            </EmptyState>
          )}
        </section>
      ) : null}
    </>
  );
}
