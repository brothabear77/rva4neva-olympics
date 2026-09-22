"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DWELL_MS, stepIndex, type Quote } from "@/lib/quotes";

/**
 * Past this many quotes a row of dots stops fitting; show "3 / 30" instead. The
 * arrows and the pause button share the row, so on a 360px phone about eight
 * dots (24px each) is the most that leaves room for them.
 */
const MAX_DOTS = 8;

/**
 * 1 moves forward (the next quote enters from the right), -1 moves back (it
 * enters from the left). Full class names, not built from pieces, so Tailwind
 * can see them.
 */
type Direction = 1 | -1;
const ENTER = { 1: "animate-quote-in-right", [-1]: "animate-quote-in-left" } as const;
const LEAVE = { 1: "animate-quote-out-left", [-1]: "animate-quote-out-right" } as const;

/**
 * A borderless quote carousel: text on the page background, no box, no rules.
 *
 * Quotes slide sideways. Every quote sits in the same grid cell, so the block is
 * always as tall as the tallest quote and the countdown above it never jumps.
 * At rest only the current quote is visible; when it changes, the old and new
 * quotes are animated across one slide width together.
 *
 * Sliding has to be clipped somewhere, and a hard clip would draw an edge. The
 * clip is feathered with a mask instead, and each quote is padded in from the
 * edges so its own text never lands in the faded zone.
 *
 * Previous and next arrows step through the quotes, wrapping at either end.
 *
 * It advances on its own, which is only acceptable if people can stop it, so it
 * pauses while the pointer is over it, while it has keyboard focus, and while
 * the tab is hidden. There is also an explicit pause button for touch screens,
 * where none of those apply. With reduced motion requested it starts paused and
 * changes quotes without sliding.
 */
export function QuoteCarousel({ quotes }: { quotes: Quote[] }) {
  const count = quotes.length;
  // `prev` and `dir` describe the last move, which is what gets animated.
  const [view, setView] = useState<{ index: number; prev: number | null; dir: Direction }>({
    index: 0,
    prev: null,
    dir: 1,
  });
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  const current = count > 0 ? view.index % count : 0;
  const previous = view.prev !== null && count > 0 ? view.prev % count : null;
  const advancing = count > 1 && playing && !hovered && !focused && tabVisible;

  // Read after mount: the server cannot know either of these.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);

    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // One timeout per quote. A manual jump changes `current`, which restarts this
  // rather than letting the old timer cut the new quote short.
  useEffect(() => {
    if (!advancing) return;
    const timer = setTimeout(
      () => setView((v) => ({ index: stepIndex(v.index, 1, count), prev: v.index, dir: 1 })),
      DWELL_MS,
    );
    return () => clearTimeout(timer);
  }, [advancing, current, count]);

  /**
   * Previous / next. The direction is passed in rather than inferred from the
   * indexes: going next from the last quote to the first is still a move
   * forward, and previous from the first to the last is still a move back.
   */
  const step = (delta: 1 | -1) =>
    setView((v) => {
      const from = count > 0 ? v.index % count : 0;
      return { index: stepIndex(from, delta, count), prev: from, dir: delta };
    });

  const goTo = (target: number) => {
    if (target === current) return;
    // Later dot: slide forward. Earlier dot: slide back.
    setView({ index: target, prev: current, dir: target > current ? 1 : -1 });
  };

  /** The slide animation for quote `i`, if it is part of the last move. */
  const motion = (i: number): string => {
    if (previous === null || previous === current) return "";
    if (i === current) return ENTER[view.dir];
    if (i === previous) return LEAVE[view.dir];
    return "";
  };

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Quotes"
      className="w-full max-w-3xl"
      // Mouse only: on a touch screen a tap would leave "hover" stuck on and
      // freeze the carousel until the next tap elsewhere.
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // Keyboard focus only: clicking a dot also focuses it, and that should
      // not park the carousel there for good.
      onFocus={(e) => e.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {/* Clips the sliding quotes; the mask feathers that clip into nothing. */}
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        {/* While it advances by itself, announcing every change would talk over
            the screen reader; announce only when a person moved it. */}
        <div className="grid" aria-live={advancing ? "off" : "polite"}>
          {quotes.map((quote, i) => (
            <figure
              key={`${i}-${quote.text}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              inert={i !== current}
              className={[
                "col-start-1 row-start-1 flex flex-col items-center justify-start gap-3 px-[8%]",
                i === current ? "opacity-100" : "opacity-0",
                motion(i),
                "motion-reduce:animate-none",
              ].join(" ")}
            >
              <blockquote className="text-balance font-sans text-xl leading-snug text-paper sm:text-2xl">
                <p>{`“${quote.text}”`}</p>
              </blockquote>
              {quote.author ? <figcaption className="eyebrow">&mdash; {quote.author}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>

      {count > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center">
          <IconButton label="Previous quote" onClick={() => step(-1)}>
            <ChevronLeft />
          </IconButton>

          {count <= MAX_DOTS ? (
            <div className="flex items-center">
              {quotes.map((quote, i) => (
                <button
                  key={`${i}-${quote.text}`}
                  type="button"
                  aria-label={`Show quote ${i + 1} of ${count}`}
                  aria-current={i === current ? "true" : undefined}
                  onClick={() => goTo(i)}
                  className="group flex h-6 w-6 items-center justify-center"
                >
                  <span
                    className={[
                      "block rounded-full transition-all",
                      i === current ? "h-2 w-2 bg-accent" : "h-1.5 w-1.5 bg-muted group-hover:bg-paper",
                    ].join(" ")}
                  />
                </button>
              ))}
            </div>
          ) : (
            // Fixed width, so "9 / 13" becoming "10 / 13" does not nudge the arrows.
            <span className="tnum eyebrow min-w-16 text-center">
              {current + 1} / {count}
            </span>
          )}

          <IconButton label="Next quote" onClick={() => step(1)}>
            <ChevronRight />
          </IconButton>

          <IconButton
            label={playing ? "Pause quote rotation" : "Play quote rotation"}
            onClick={() => setPlaying((p) => !p)}
            className="ml-2"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}

/** A borderless round icon button. 40px, so it is a comfortable tap target. */
function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[
        "flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:text-paper",
        className,
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        {children}
      </svg>
    </button>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ChevronLeft = () => <path d="M15 5l-7 7 7 7" {...stroke} />;
const ChevronRight = () => <path d="M9 5l7 7-7 7" {...stroke} />;

const PauseIcon = () => (
  <>
    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </>
);

const PlayIcon = () => (
  <path d="M8 5.6v12.8a.6.6 0 0 0 .9.5l10.4-6.4a.6.6 0 0 0 0-1L8.9 5.1a.6.6 0 0 0-.9.5z" fill="currentColor" />
);
