import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, pageHref, readPaging } from "../paging";

describe("readPaging", () => {
  it("defaults to the first page at the default size", () => {
    expect(readPaging({}, 120)).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, pageCount: Math.ceil(120 / DEFAULT_PAGE_SIZE), offset: 0 });
  });

  it("uses a listed size and works out the offset", () => {
    expect(readPaging({ page: "3", size: "25" }, 120)).toEqual({ page: 3, size: 25, pageCount: 5, offset: 50 });
  });

  it("ignores a size that isn't offered", () => {
    expect(readPaging({ size: "7" }, 120).size).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps a page past the end to the last page, and junk to the first", () => {
    expect(readPaging({ page: "99", size: "100" }, 120).page).toBe(2);
    expect(readPaging({ page: "abc" }, 120).page).toBe(1);
    expect(readPaging({ page: "-4" }, 120).page).toBe(1);
  });

  it("has one page when there is nothing", () => {
    expect(readPaging({ page: "2" }, 0)).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, pageCount: 1, offset: 0 });
  });
});

describe("pageHref", () => {
  it("leaves out the defaults", () => {
    expect(pageHref("/changelog", 1, DEFAULT_PAGE_SIZE)).toBe("/changelog");
    expect(pageHref("/changelog", 2, 25)).toBe("/changelog?page=2&size=25");
  });
});
