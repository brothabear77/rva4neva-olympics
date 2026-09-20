import Link from "next/link";
import { ChangeLogTable } from "@/components/ChangeLogTable";
import { EmptyState, PageHeader } from "@/components/ui";
import { getChangeLog } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Change History" };

export default async function ChangeLogPage() {
  const entries = await getChangeLog(200);

  return (
    <>
      <PageHeader
        eyebrow="Append-only"
        title="Change History"
        description="Every score ever added, edited or removed, and who did it. Nothing on this page can be deleted — restoring an earlier version adds a new entry rather than erasing the ones after it."
        actions={
          <Link href="/submit" className="btn btn-ghost">
            Submit results
          </Link>
        }
      />

      {entries.length === 0 ? (
        <EmptyState title="Nothing has changed yet">
          The history fills in as results are submitted.
        </EmptyState>
      ) : (
        <>
          <ChangeLogTable entries={entries} />
          {entries.length >= 200 ? (
            <p className="mt-4 text-xs text-muted">
              Showing the 200 most recent changes.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
