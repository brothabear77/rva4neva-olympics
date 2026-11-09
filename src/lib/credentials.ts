/**
 * What's accepted as a username or password. Shared by the
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

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 30;

/** Lowercase letters, digits, and . _ - ; stored lowercase, compared ignoring case. */
export function checkUsername(text: string): Check<string> {
  const username = text.trim().toLowerCase();
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    return { ok: false, error: `Use ${MIN_USERNAME_LENGTH} to ${MAX_USERNAME_LENGTH} characters.` };
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return { ok: false, error: "Use only letters, numbers, dots, dashes and underscores." };
  }
  return { ok: true, value: username };
}

/** A starting username from a display name: "Dana Scully" -> "danascully". */
export function defaultUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
