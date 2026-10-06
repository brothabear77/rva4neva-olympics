/**
 * What's accepted as a password or a phone number on the claim form. Shared by the
 * form (for instant feedback) and the server (which checks again).
 */

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkPassword(password: string, confirm?: string): Check<string> {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, error: "That password is too long." };
  if (confirm !== undefined && confirm !== password) return { ok: false, error: "The two passwords don't match." };
  return { ok: true, value: password };
}

/**
 * A US phone number, as just its ten digits: "(804) 555-0123", "804.555.0123" and
 * "+1 804 555 0123" are all "8045550123".
 */
export function normalizePhone(text: string): Check<string> {
  let digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, error: "Enter a 10-digit phone number." };
  return { ok: true, value: digits };
}

/** "8045550123" -> "(804) 555-0123", for the admin's list. */
export function formatPhone(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}
