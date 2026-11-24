import { describe, expect, it } from "vitest";
import { originAllowed, statusForFailure } from "../apiStatus";
import { NOT_ALLOWED, NOT_SIGNED_IN } from "../authMessages";
import { parseBearer } from "../bearer";

describe("parseBearer", () => {
  const token = "Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5";

  it("reads a bearer token", () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
    expect(parseBearer(`bearer ${token}`)).toBe(token);
  });

  it("ignores anything not shaped like a session token", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer(`Basic ${token}`)).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
    expect(parseBearer(`Bearer ${token} extra`)).toBeNull();
    expect(parseBearer("Bearer abc.def/ghi+jkl==mnopqrstu")).toBeNull();
  });
});

describe("statusForFailure", () => {
  it("gives auth refusals their own codes", () => {
    expect(statusForFailure(NOT_SIGNED_IN)).toBe(401);
    expect(statusForFailure(NOT_ALLOWED)).toBe(403);
  });

  it("treats anything else as a bad request", () => {
    expect(statusForFailure("That name is taken.")).toBe(400);
  });
});

describe("originAllowed", () => {
  it("lets reads through from anywhere", () => {
    expect(originAllowed("GET", "https://evil.example", "olympics.example")).toBe(true);
  });

  it("lets the app's writes through (no Origin header)", () => {
    expect(originAllowed("POST", null, "olympics.example")).toBe(true);
  });

  it("allows same-site writes and refuses cross-site ones", () => {
    expect(originAllowed("POST", "https://olympics.example", "olympics.example")).toBe(true);
    expect(originAllowed("DELETE", "https://evil.example", "olympics.example")).toBe(false);
    expect(originAllowed("PATCH", "null", "olympics.example")).toBe(false);
  });
});
