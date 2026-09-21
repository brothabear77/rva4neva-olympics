/**
 * Rules for athlete names, shared by the roster editor (for instant feedback as
 * you type) and the server (which checks again, because the browser is not
 * trusted and the roster may have changed since the page loaded).
 */

export const MAX_NAME_LENGTH = 80;

/** Collapse runs of whitespace and trim: "  Dana   Scully " -> "Dana Scully". */
export function normalizeName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/**
 * Is `text` acceptable as an athlete's name?
 *
 * Names are unique ignoring case, matching the database's unique index, so "nick"
 * clashes with "Nick". When renaming, pass the athlete's own id as `exceptId` so
 * they do not clash with themselves. That is also what allows a rename that only
 * changes the capitalisation: "nick" -> "Nick".
 */
export function checkAthleteName(
  text: string,
  roster: readonly { id: string; name: string }[],
  exceptId?: string,
): NameCheck {
  const name = normalizeName(text);
  if (name === "") return { ok: false, error: "Enter a name." };
  if (Array.from(name).length > MAX_NAME_LENGTH) return { ok: false, error: "That name is too long." };

  const clash = roster.find((a) => a.id !== exceptId && a.name.toLowerCase() === name.toLowerCase());
  if (clash) return { ok: false, error: `${clash.name} is already on the roster.` };

  return { ok: true, name };
}

/** The question asked before a delete, naming what else goes with the athlete. */
export function deletePrompt(name: string, scores: number): string {
  if (scores === 0) return `Delete ${name}?`;
  return `Delete ${name} and their ${scores} score${scores === 1 ? "" : "s"}?`;
}
