/**
 * Quotes for the countdown-page carousel.
 *
 * The quotes themselves live in src/content/quotes.ts. This file is the logic
 * around them, kept pure so it can be tested: tidy up whatever was typed, and
 * decide how long each quote stays on screen.
 */

export interface QuoteInput {
  text: string;
  author?: string;
}

export interface Quote {
  text: string;
  author?: string;
}

/**
 * Drop one pair of quotation marks wrapped around the whole quote. The carousel
 * adds its own, and pasted quotes usually arrive with theirs, which would
 * otherwise show as ““like this””.
 *
 * Only strips when the marks clearly belong to the whole quote. `"a" and "b"`
 * is two quotations, not one wrapped in a pair, so it is left alone.
 */
function stripWrappingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["“", "”"],
  ];
  for (const [open, close] of pairs) {
    if (text.length > 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(1, -1);
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return text;
}

/** Normalise the hand-written list: trim, tidy whitespace, drop blanks. */
export function cleanQuotes(input: readonly QuoteInput[]): Quote[] {
  const quotes: Quote[] = [];

  for (const item of input) {
    // Collapse runs of whitespace so a quote written across several lines in a
    // template string reads as one paragraph.
    const text = stripWrappingQuotes((item.text ?? "").replace(/\s+/g, " ").trim());
    if (!text) continue;

    const author = (item.author ?? "").replace(/\s+/g, " ").trim();
    quotes.push(author ? { text, author } : { text });
  }

  return quotes;
}

/**
 * The index `delta` places from `index`, wrapping around either end of the
 * list, so "next" from the last quote lands on the first and "previous" from
 * the first lands on the last. JavaScript's `%` keeps the sign of its left
 * operand, so stepping back from 0 needs the extra `+ count` to avoid -1.
 */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/**
 * How long each quote stays before the carousel moves to the next, the same for
 * every quote. The sideways slide (700ms, in globals.css) happens inside this
 * time, so a quote is fully at rest for about 4.3 of these 5 seconds.
 */
export const DWELL_MS = 5_000;
