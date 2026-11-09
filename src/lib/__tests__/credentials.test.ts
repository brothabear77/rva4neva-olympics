import { describe, expect, it } from "vitest";
import { checkPassword, checkUsername, defaultUsername } from "../credentials";
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

describe("checkUsername", () => {
  it("lowercases and trims", () => {
    expect(checkUsername("  NickH ")).toEqual({ ok: true, value: "nickh" });
  });

  it("allows dots, dashes and underscores after the first character", () => {
    expect(checkUsername("a.b-c_d")).toEqual({ ok: true, value: "a.b-c_d" });
  });

  it("rejects too short, too long, spaces and odd characters", () => {
    expect(checkUsername("ab").ok).toBe(false);
    expect(checkUsername("a".repeat(31)).ok).toBe(false);
    expect(checkUsername("nick h").ok).toBe(false);
    expect(checkUsername("-nick").ok).toBe(false);
    expect(checkUsername("nick@home").ok).toBe(false);
  });
});

describe("defaultUsername", () => {
  it("lowercases and drops everything but letters and digits", () => {
    expect(defaultUsername("Dana Scully")).toBe("danascully");
    expect(defaultUsername("Pam")).toBe("pam");
  });
});
