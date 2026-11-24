import { api, json } from "@/lib/api";
import { canScore, getSession } from "@/lib/auth";
import { submissionsLocked } from "@/lib/flags";
import { readPaging } from "@/lib/paging";
import { countChangeLog, getChangeLog } from "@/lib/queries";

/** The append-only history, newest first, a page at a time (?page=1&size=25). Public, like the page. */
export const GET = api(async (request) => {
  const url = new URL(request.url);
  const [total, locked, session] = await Promise.all([countChangeLog(), submissionsLocked(), getSession()]);
  const paging = readPaging(
    { page: url.searchParams.get("page") ?? undefined, size: url.searchParams.get("size") ?? undefined },
    total,
  );
  const entries = await getChangeLog(paging.size, paging.offset);
  return json({
    entries,
    total,
    page: paging.page,
    pageCount: paging.pageCount,
    size: paging.size,
    locked,
    canRestore: canScore(session),
  });
});
