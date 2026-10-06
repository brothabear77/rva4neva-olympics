import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession, isMember } from "@/lib/auth";
import { showVlogPage } from "@/lib/flags";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vlog" };

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

      <section aria-labelledby="upload-heading" className="mb-10">
        <h2 id="upload-heading" className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">
          Upload a video
        </h2>
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
      </section>

      <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-paper">Latest videos</h2>
      <EmptyState title="No videos yet">Once uploads are on, everyone&apos;s clips will show up here.</EmptyState>
    </>
  );
}
