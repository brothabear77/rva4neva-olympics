import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * How a password is stored. Server-only in practice (node:crypto); the rules for what
 * is accepted live in credentials.ts, so the forms can check as you type.
 *
 * Hashing uses Node's built-in scrypt rather than a package: it is a proper
 * password hash, and keeps the dependency list and the container image as they are.
 * A stored hash is "scrypt$<salt>$<hash>", both base64, so the format can change
 * later without guessing which hashes are which.
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;

  const expected = Buffer.from(keyText, "base64");
  const actual = await derive(password, Buffer.from(saltText, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
