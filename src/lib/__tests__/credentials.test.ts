import { describe, expect, it } from "vitest";
import { checkPassword, formatPhone, normalizePhone } from "../credentials";
import { hashPassword, verifyPassword } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("accepts the password it hashed", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
  });

  it("rejects a different password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horsf", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts each hash, so the same password never hashes the same twice", async () => {
    const [a, b] = await Promise.all([hashPassword("same one"), hashPassword("same one")]);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("rejects a stored value that is not a hash it made", async () => {
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$x$y")).toBe(false);
  });
});

describe("checkPassword", () => {
  it("needs eight characters", () => {
    expect(checkPassword("seven77").ok).toBe(false);
    expect(checkPassword("eight888").ok).toBe(true);
  });

  it("needs the confirmation to match when one is given", () => {
    expect(checkPassword("longenough", "longenougH")).toEqual({ ok: false, error: "The two passwords don't match." });
    expect(checkPassword("longenough", "longenough").ok).toBe(true);
  });
});

describe("normalizePhone", () => {
  it("keeps just the ten digits, however it was typed", () => {
    for (const typed of ["(804) 555-0123", "804.555.0123", "+1 804 555 0123", "18045550123"]) {
      expect(normalizePhone(typed)).toEqual({ ok: true, value: "8045550123" });
    }
  });

  it("rejects anything that is not ten digits", () => {
    expect(normalizePhone("555-0123").ok).toBe(false);
    expect(normalizePhone("28045550123").ok).toBe(false);
    expect(normalizePhone("").ok).toBe(false);
  });

  it("formats ten digits for reading", () => {
    expect(formatPhone("8045550123")).toBe("(804) 555-0123");
  });
});
