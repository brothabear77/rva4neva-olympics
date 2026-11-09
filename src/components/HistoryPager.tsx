"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PAGE_SIZES, pageHref } from "@/lib/paging";

const PATH = "/changelog";
const LINK = "btn btn-ghost";
const OFF = "btn btn-ghost pointer-events-none opacity-40";

/**
 * Paging for Change History: newer and older pages, a box to jump to a page, and how many
 * entries per page. All
 * live in the URL, so a page can be linked to and the back button works. Changing the size
 * goes back to the first page, since the old page number means something else at a new size.
 */
export function HistoryPager({
  page,
  pageCount,
  size,
  total,
  showSize = false,
}: {
  page: number;
  pageCount: number;
  size: number;
  total: number;
  showSize?: boolean;
}) {
  const router = useRouter();
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);

  return (
    <nav aria-label="Change history pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="tnum text-sm text-muted">
        {first}–{last} of {total}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {showSize ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            Per page
            <select
              value={size}
              onChange={(e) => router.push(pageHref(PATH, 1, Number(e.target.value)))}
              className="field w-auto py-1"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {page > 1 ? (
          <Link href={pageHref(PATH, page - 1, size)} className={LINK} rel="prev">
            ← Newer
          </Link>
        ) : (
          <span className={OFF} aria-disabled="true">
            ← Newer
          </span>
        )}
        {/* Keyed by page so the box shows the new page number after any navigation. */}
        <PageJump key={page} page={page} pageCount={pageCount} size={size} />
        {page < pageCount ? (
          <Link href={pageHref(PATH, page + 1, size)} className={LINK} rel="next">
            Older →
          </Link>
        ) : (
          <span className={OFF} aria-disabled="true">
            Older →
          </span>
        )}
      </div>
    </nav>
  );
}

/** "Page [ 3 ] of 14": type a page and press Enter or Go. Out-of-range numbers go to the nearest page. */
function PageJump({ page, pageCount, size }: { page: number; pageCount: number; size: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState(String(page));
  // The pager shows at the top and bottom, so each box needs its own id.
  const inputId = useId();

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const wanted = Math.floor(Number(draft));
    if (!Number.isFinite(wanted)) return setDraft(String(page));
    const target = Math.min(Math.max(wanted, 1), pageCount);
    setDraft(String(target));
    if (target !== page) router.push(pageHref(PATH, target, size));
  };

  return (
    // noValidate: the browser would block 999 with a popup; go() sends it to the last page instead.
    <form onSubmit={go} noValidate className="flex items-center gap-2 text-sm text-muted">
      <label htmlFor={inputId}>Page</label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="field tnum w-16 py-1 text-center"
      />
      <span className="tnum">of {pageCount}</span>
      <button type="submit" className="btn btn-ghost">
        Go
      </button>
    </form>
  );
}
