import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession, isMember } from "@/lib/auth";
import { showVlogPage } from "@/lib/flags";
import { isLocalDev } from "@/lib/publicFiles";
import { VlogFeed } from "@/components/VlogFeed";
import type { VlogItem } from "@/components/VlogGrid";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vlog" };

/**
 * Stand-in clips for laying the page out before uploads exist. They live in the
 * gitignored public/vlog-preview/, and are only ever shown when running locally.
 */
const SAMPLE_ITEMS: VlogItem[] = [
  { id: "s1", title: "Cone drill, take three", athleteName: "Sample Athlete A", eventName: "Cone Drill", src: "/vlog-preview/cone-drill.mov", poster: "/vlog-preview/cone-drill.png", postedAt: "2026-09-25T20:08:00-04:00" },
  { id: "s2", title: "Sprint finish", athleteName: "Sample Athlete B", src: "/vlog-preview/sprint-finish.mov", poster: "/vlog-preview/sprint-finish.png", postedAt: "2026-09-23T12:33:00-04:00" },
  { id: "s3", title: "Highlight reel", athleteName: "Sample Athlete B", eventName: "Mile Run", src: "/vlog-preview/highlight.mp4", poster: "/vlog-preview/highlight.png", postedAt: "2026-09-23T21:57:00-04:00" },
];

/** The page for sharing videos. Uploading isn't built yet: this is the shell, and it is behind a feature flag. */
export default async function VlogPage() {
  // Behind the "show-vlog-page" flag: while it's off the page doesn't exist for anyone,
  // so this comes before the sign-in check.
  if (!(await showVlogPage())) redirect("/");

  const session = await getSession();
  if (!session) redirect("/login?next=/athletes/vlog");
  if (!isMember(session)) redirect("/");

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
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-paper">Upload a video</h2>
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
          <div className="card space-y-4 p-4 sm:p-6">
            <div className="rounded-lg border-2 border-dashed border-[var(--edge-strong)] px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">Drop a video here</p>
              <p className="mt-1 text-sm text-muted">Video uploads are coming soon.</p>
            </div>
            <div>
              <label className="label" htmlFor="vlogTitle">
                Title
              </label>
              <input id="vlogTitle" disabled placeholder="What happened in this clip?" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="vlogEvent">
                Event <span className="text-muted">(optional)</span>
              </label>
              <select id="vlogEvent" disabled className="field">
                <option>Not tied to an event</option>
              </select>
            </div>
            <button type="button" disabled className="btn">
              Upload
            </button>
          </div>
        </div>
      </details>

      <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">Latest videos</h2>
      {isLocalDev ? (
        <VlogFeed items={SAMPLE_ITEMS} />
      ) : (
        <EmptyState title="No videos yet">Once uploads are on, everyone&apos;s clips will show up here.</EmptyState>
      )}
    </>
  );
}
