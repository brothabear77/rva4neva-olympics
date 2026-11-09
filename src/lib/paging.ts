/**
 * Reading ?page= and ?size= from a URL for a paged list (Change History). Pure, so the
 * page and its controls agree, and anything odd in the URL falls back to something sensible.
 */

export const PAGE_SIZES = [10, 25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 10;

export interface Paging {
  page: number;
  size: number;
  pageCount: number;
  offset: number;
}

function firstNumber(value: string | string[] | undefined): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

/**
 * The page to show out of `total` items. A size not in PAGE_SIZES uses the default, and a
 * page past the end shows the last page, so an old link to page 9 still shows something.
 */
export function readPaging(params: { page?: string | string[]; size?: string | string[] }, total: number): Paging {
  const asked = firstNumber(params.size);
  const size = (PAGE_SIZES as readonly number[]).includes(asked) ? asked : DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const wanted = Math.floor(firstNumber(params.page));
  const page = Number.isFinite(wanted) ? Math.min(Math.max(wanted, 1), pageCount) : 1;
  return { page, size, pageCount, offset: (page - 1) * size };
}

/** The URL for one page; the defaults are left out so the plain address stays plain. */
export function pageHref(path: string, page: number, size: number): string {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (size !== DEFAULT_PAGE_SIZE) query.set("size", String(size));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
