import { formatEventDateTime } from "@/lib/time";
import { HeartButton } from "./HeartButton";
import { VlogDeleteButton } from "./VlogDeleteButton";

export type VlogItem = {
  id: string;
  title: string;
  athleteName: string;
  eventName?: string;
  src: string;
  /** A still shown until play is pressed. Without one the browser draws the first frame itself. */
  poster?: string;
  /** ISO timestamp the clip was uploaded. */
  postedAt: string;
  /** How many athletes have hearted it, and whether the viewer has. */
  hearts: number;
  hearted: boolean;
  /** The viewer uploaded it, or is the admin. */
  canDelete: boolean;
};

/**
 * The Vlog's feed: one card per clip, newest first (the caller sorts).
 *
 * Every player sits in a fixed 16:9 frame on black with the video letterboxed inside it
 * (`object-contain`), so a phone's portrait clip and a screen recording line up in the
 * same grid instead of making rows of uneven height. `preload="metadata"` fetches just
 * enough for a poster frame, so a page of clips does not download them all.
 */
export function VlogGrid({ items, canHeart }: { items: VlogItem[]; canHeart: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="card flex flex-col overflow-hidden">
          <div className="aspect-video w-full bg-black">
            <video
              src={`${item.src}#t=0.1`}
              poster={item.poster}
              controls
              playsInline
              preload="metadata"
              aria-label={item.title}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="space-y-1 p-4">
            <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-paper">{item.title}</h3>
            <p className="text-sm text-muted">
              {item.athleteName}
              {item.eventName ? ` · ${item.eventName}` : ""}
            </p>
            <p className="text-xs text-muted">
              Uploaded <time dateTime={item.postedAt}>{formatEventDateTime(item.postedAt)}</time>
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <HeartButton videoId={item.id} count={item.hearts} hearted={item.hearted} canHeart={canHeart} />
              {item.canDelete ? <VlogDeleteButton videoId={item.id} title={item.title} /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
