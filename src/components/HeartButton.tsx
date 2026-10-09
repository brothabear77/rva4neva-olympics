"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setHeart } from "@/lib/vlogActions";

/**
 * A heart and its count under a video. The count moves as soon as it's pressed and settles
 * on what the server says once the action returns. Without `canHeart` (the admin, who has
 * no athlete of their own) it shows the count and is not a button.
 */
export function HeartButton({
  videoId,
  count,
  hearted,
  canHeart,
}: {
  videoId: string;
  count: number;
  hearted: boolean;
  canHeart: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useOptimistic({ count, hearted }, (_, next: { count: number; hearted: boolean }) => next);

  const label = `${shown.count} ${shown.count === 1 ? "heart" : "hearts"}`;
  const icon = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill={shown.hearted ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.4 4.5 6.8 4.5c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.4 0 5.2 3.4 4 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
    </svg>
  );

  if (!canHeart) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted" aria-label={label}>
        {icon}
        {shown.count}
      </span>
    );
  }

  const toggle = () =>
    start(async () => {
      setError(null);
      const next = !shown.hearted;
      setShown({ count: shown.count + (next ? 1 : -1), hearted: next });
      const result = await setHeart({ videoId, hearted: next });
      if (!result.ok) setError(result.message);
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={shown.hearted}
        aria-label={`${shown.hearted ? "Remove your heart" : "Heart this video"} (${label})`}
        className={`inline-flex items-center gap-1.5 text-sm transition-colors ${shown.hearted ? "text-red-300" : "text-muted hover:text-paper"}`}
      >
        {icon}
        {shown.count}
      </button>
      {error ? <span className="text-sm text-red-200">{error}</span> : null}
    </div>
  );
}
