"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEventClock } from "@/lib/time";

/**
 * Keeps a server-rendered page current by re-fetching it on an interval.
 *
 * Polling rather than websockets: the app runs on serverless functions where a
 * held-open connection is the awkward path, and a few seconds of lag on a
 * backyard scoreboard costs nothing. Refreshing pauses while the tab is hidden
 * so a phone left in a pocket all afternoon is not querying Aurora.
 */
export function LiveRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdatedAt(new Date());
    };

    const start = () => {
      stop();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick(); // catch up on whatever was missed while away
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      {updatedAt
        ? `Updated ${formatEventClock(updatedAt)}`
        : "Live"}
    </span>
  );
}
