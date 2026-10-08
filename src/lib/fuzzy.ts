/**
 * Forgiving text matching for the Vlog's title search. Small on purpose: titles are a few
 * words, so there is nothing to index or rank, only "should this one stay in the list".
 *
 * A title matches when every word typed matches some word of the title. A typed word
 * matches when it
 *   - appears inside the title's words (so half-typed words work: "spri" finds "Sprint"),
 *   - or is a typo of the start of a title word or of a whole one: one slip allowed for
 *     words of 4 to 6 letters, two for longer ones. A slip is a letter added, dropped,
 *     changed, or two neighbours swapped. Shorter words must be exact, or "run" would
 *     match "sun" and "fun".
 * Case, accents and punctuation are ignored.
 */

/** Lowercase, accents removed, split into letter-and-digit words. */
export function searchWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Optimal string alignment distance: Levenshtein, where swapping two neighbours counts as one. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/** How many slips a typed word of this length is forgiven. */
function allowedSlips(length: number): number {
  if (length < 4) return 0;
  return length < 7 ? 1 : 2;
}

function wordMatches(typed: string, titleWords: string[]): boolean {
  const slips = allowedSlips(typed.length);
  return titleWords.some(
    (word) =>
      word.includes(typed) ||
      (slips > 0 &&
        (editDistance(typed, word) <= slips || editDistance(typed, word.slice(0, typed.length)) <= slips)),
  );
}

/** Whether `title` fits what was typed. Nothing typed fits everything. */
export function fuzzyMatches(title: string, query: string): boolean {
  const typed = searchWords(query);
  if (typed.length === 0) return true;
  const titleWords = searchWords(title);
  return typed.every((word) => wordMatches(word, titleWords));
}
