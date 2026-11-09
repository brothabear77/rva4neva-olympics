import { describe, expect, it, vi } from "vitest";
import { dbErrorCode, describeDbError, isUniqueViolation, userMessage } from "../dbErrors";

/** What drizzle throws: the SQL and parameters as the message, the Postgres error as the cause. */
function wrapped(cause: object) {
  return Object.assign(new Error("Failed query: insert into accounts ...\nparams: athlete,scrypt$secret"), { cause });
}

describe("database errors", () => {
  const duplicate = wrapped({ code: "23505", message: "duplicate key value", detail: "Key (lower(username))=(ahmed) already exists.", constraint: "accounts_username_lower_key" });

  it("finds the Postgres code under the wrapper", () => {
    expect(dbErrorCode(duplicate)).toBe("23505");
    expect(isUniqueViolation(duplicate)).toBe(true);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
  });

  it("describes the database's words, never the parameters", () => {
    const text = describeDbError(duplicate);
    expect(text).toContain("already exists");
    expect(text).toContain("accounts_username_lower_key");
    expect(text).not.toContain("scrypt");
  });

  it("passes the app's own messages through, and hides database ones", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userMessage(new Error("That athlete was already deleted."), "fallback")).toBe("That athlete was already deleted.");
    expect(userMessage(duplicate, "fallback")).toBe("fallback");
    expect(log.mock.calls[0][0]).not.toContain("scrypt");
    log.mockRestore();
  });
});
