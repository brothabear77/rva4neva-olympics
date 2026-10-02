/**
 * A looping fall of confetti pieces — gold and paper, the two lightest colors in
 * the five-color palette (globals.css), so the celebration doesn't need a sixth.
 *
 * Absolutely positioned to fill its nearest positioned ancestor, so it reads as
 * falling over whatever that is: the whole hero section around the Champion card
 * on the homepage, say. That ancestor needs `relative overflow-hidden` of its
 * own; this component doesn't add either, so it can be dropped into a container
 * that already has other absolutely-positioned decoration (the hero's accent
 * wash) without the two fighting over which one owns the positioning.
 *
 * A fixed list of pieces, not Math.random() at render — this can render on the
 * server, and random values there would mismatch whatever the client renders on
 * hydration. The numbers are chosen to look scattered (co-prime-ish steps), not
 * to mean anything. `prefers-reduced-motion` turns the whole thing off.
 */
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  key: i,
  left: (i * 37) % 100,
  size: i % 3 === 0 ? 10 : i % 3 === 1 ? 7 : 5,
  round: i % 4 === 0,
  color: i % 2 === 0 ? "var(--color-accent)" : "var(--color-paper)",
  duration: 4 + ((i * 7) % 5),
  // Negative delays start each piece already mid-fall, so the loop looks
  // continuous from the first paint instead of every piece starting at the top
  // together.
  delay: -((i * 2.6) % (4 + ((i * 7) % 5))),
}));

export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
      {PIECES.map((p) => (
        <span
          key={p.key}
          className="animate-confetti absolute block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
