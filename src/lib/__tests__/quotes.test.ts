import { describe, expect, it } from "vitest";
import { cleanQuotes, stepIndex } from "../quotes";

describe("cleanQuotes", () => {
  it("keeps quotes in the order written", () => {
    const out = cleanQuotes([{ text: "one" }, { text: "two" }, { text: "three" }]);
    expect(out.map((q) => q.text)).toEqual(["one", "two", "three"]);
  });

  it("trims text and author", () => {
    expect(cleanQuotes([{ text: "  Hello there  ", author: "  Someone  " }])).toEqual([
      { text: "Hello there", author: "Someone" },
    ]);
  });

  it("drops blank and whitespace-only entries", () => {
    expect(cleanQuotes([{ text: "" }, { text: "   \n " }, { text: "kept" }])).toEqual([
      { text: "kept" },
    ]);
  });

  it("omits an empty author rather than showing a bare dash", () => {
    expect(cleanQuotes([{ text: "hi", author: "   " }])).toEqual([{ text: "hi" }]);
    expect(cleanQuotes([{ text: "hi" }])[0]).not.toHaveProperty("author");
  });

  it("joins a quote written across several lines into one paragraph", () => {
    const text = `Line one
      line two,   line three`;
    expect(cleanQuotes([{ text }])[0].text).toBe("Line one line two, line three");
  });

  it("returns nothing for an empty list", () => {
    expect(cleanQuotes([])).toEqual([]);
  });
});

describe("cleanQuotes — quotation marks", () => {
  it("removes a pasted pair of straight quotes", () => {
    expect(cleanQuotes([{ text: '"Go for it."' }])[0].text).toBe("Go for it.");
  });

  it("removes a pasted pair of curly quotes", () => {
    expect(cleanQuotes([{ text: "“Go for it.”" }])[0].text).toBe("Go for it.");
  });

  it("leaves quotation marks inside the quote alone", () => {
    const text = 'He said "go" and we went.';
    expect(cleanQuotes([{ text }])[0].text).toBe(text);
  });

  it("does not treat two separate quotations as one wrapped pair", () => {
    const text = '"Yes" and "no"';
    expect(cleanQuotes([{ text }])[0].text).toBe(text);
  });

  it("never strips apostrophes or single quotes", () => {
    expect(cleanQuotes([{ text: "'Twas the night" }])[0].text).toBe("'Twas the night");
    expect(cleanQuotes([{ text: "It's ours" }])[0].text).toBe("It's ours");
  });

  it("does not strip an unbalanced mark", () => {
    expect(cleanQuotes([{ text: '"Unfinished' }])[0].text).toBe('"Unfinished');
  });

  it("does not turn a lone pair of marks into an empty quote", () => {
    expect(cleanQuotes([{ text: '""' }])[0].text).toBe('""');
  });
});

describe("stepIndex", () => {
  it("moves forward and back by one", () => {
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(2, -1, 5)).toBe(1);
  });

  it("wraps from the last quote to the first", () => {
    expect(stepIndex(4, 1, 5)).toBe(0);
  });

  it("wraps from the first quote to the last, never to -1", () => {
    expect(stepIndex(0, -1, 5)).toBe(4);
  });

  it("swaps between two quotes in either direction", () => {
    expect(stepIndex(0, 1, 2)).toBe(1);
    expect(stepIndex(0, -1, 2)).toBe(1);
  });

  it("stays put with a single quote", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });

  it("returns 0 for an empty list instead of NaN", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it("copes with an index left past the end after the list shrank", () => {
    expect(stepIndex(9, 1, 5)).toBe(0);
    expect(stepIndex(9, -1, 5)).toBe(3);
  });
});
