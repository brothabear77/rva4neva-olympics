"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** "6d 4h 12m 09s", dropping the units that are still zero at the front. */
function describeRemaining(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m ${pad(seconds % 60)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds % 60)}s`;
  return `${minutes}m ${pad(seconds % 60)}s`;
}

/**
 * Time left to vote on one proposal, shown beside its title. Like Countdown it renders a placeholder until
 * mounted, since the remaining time differs between server and client. At zero it
 * refreshes the page, so the proposal moves to "Decided" with its outcome.
 */
export function VoteCountdown({ closesAt }: { closesAt: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(closesAt).getTime();
    let crossed = false;
    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);
      if (left <= 0 && !crossed) {
        crossed = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [closesAt, router]);

  return (
    <span className="tnum shrink-0 font-display text-lg font-semibold text-accent">
      {remaining === null ? "…" : remaining <= 0 ? "0m 00s" : describeRemaining(remaining)}
    </span>
  );
}
