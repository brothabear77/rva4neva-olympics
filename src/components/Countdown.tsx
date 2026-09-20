"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Time until the games start, or a "live now" state once they have.
 *
 * Renders a neutral placeholder on the server and fills in after mount: the
 * remaining time differs between server and client by definition, and
 * rendering it directly would be a hydration mismatch.
 */
export function Countdown({
  startsAt,
  large = false,
}: {
  startsAt: string;
  /** Bigger, centered digits for the pre-launch teaser. */
  large?: boolean;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(startsAt).getTime();
    let crossed = false;
    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);
      // The homepage swaps from teaser to full page on the server, so a tab
      // left open across kickoff needs a nudge to pick that up.
      if (left <= 0 && !crossed) {
        crossed = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startsAt, router]);

  if (remaining === null) {
    return <p className="eyebrow">Counting down…</p>;
  }

  if (remaining <= 0) {
    return (
      <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-accent">
        Games underway
      </p>
    );
  }

  const seconds = Math.floor(remaining / 1000);
  const parts = [
    { value: Math.floor(seconds / 86400), label: "days" },
    { value: Math.floor((seconds % 86400) / 3600), label: "hrs" },
    { value: Math.floor((seconds % 3600) / 60), label: "min" },
    { value: seconds % 60, label: "sec" },
  ];

  return (
    <div
      className={large ? "flex justify-center gap-5 sm:gap-10" : "flex gap-4"}
      aria-label="Time until the games begin"
    >
      {parts.map((part) => (
        <div key={part.label} className={large ? "text-center" : undefined}>
          <p
            className={[
              "tnum font-display font-bold text-paper",
              large ? "text-5xl sm:text-7xl" : "text-2xl sm:text-3xl",
            ].join(" ")}
          >
            {String(part.value).padStart(2, "0")}
          </p>
          <p className={large ? "eyebrow mt-1 sm:mt-2" : "eyebrow"}>{part.label}</p>
        </div>
      ))}
    </div>
  );
}
