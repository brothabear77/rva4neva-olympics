/**
 * Shown the instant a click leaves the page, in place of {children} in layout.tsx
 * (the header and footer around it stay mounted), until the next route's Server
 * Component finishes fetching. One file here covers every route — Next wraps
 * each segment's page in a Suspense boundary keyed to the nearest loading.tsx,
 * and no route in this app defines a more specific one.
 *
 * Most of the wait this is covering isn't the app: every real page queries the
 * database live (dynamic = "force-dynamic", no caching), and Aurora pauses after
 * five idle minutes, taking ~15s to wake back up on the next query. See "A paused
 * database" in infra/aws.md. This just means a click never reads as "did that
 * work?" while that happens.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center" role="status">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--edge-strong)] border-t-accent motion-reduce:animate-none"
      />
      <p className="eyebrow">Loading…</p>
    </div>
  );
}
