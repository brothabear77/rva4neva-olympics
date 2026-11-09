import Link from "next/link";
import { ChangeLogTable } from "@/components/ChangeLogTable";
import { HistoryPager } from "@/components/HistoryPager";
import { LockedBanner } from "@/components/LockedBanner";
import { EmptyState, PageHeader } from "@/components/ui";
import { canScore, getSession } from "@/lib/auth";
import { submissionsLocked } from "@/lib/flags";
import { readPaging } from "@/lib/paging";
import { countChangeLog, getChangeLog } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Change History" };

export default async function ChangeLogPage(props: PageProps<"/changelog">) {
  const [params, total, locked, session] = await Promise.all([props.searchParams, countChangeLog(), submissionsLocked(), getSession()]);
  const paging = readPaging(params, total);
  const entries = await getChangeLog(paging.size, paging.offset);
  const pager = { page: paging.page, pageCount: paging.pageCount, size: paging.size, total };

  return (
    <>
      <PageHeader
        eyebrow="Append-only"
        title="Change History"
        description="Every score ever added, edited or removed, changes to how events are scored, and athletes deleted, with who did it. Nothing on this page can be deleted — restoring an earlier score adds a new entry rather than erasing the ones after it."
        actions={
          canScore(session) ? (
            <Link href="/submit" className="btn btn-ghost">
              Submit results
            </Link>
          ) : undefined
        }
      />

      {locked ? <LockedBanner /> : null}

      {entries.length === 0 ? (
        <EmptyState title="Nothing has changed yet">
          The history fills in as results are submitted.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <HistoryPager {...pager} showSize />
          <ChangeLogTable entries={entries} locked={locked} canRestore={canScore(session)} />
          {paging.pageCount > 1 ? <HistoryPager {...pager} /> : null}
        </div>
      )}
    </>
  );
}
