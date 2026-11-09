/**
 * Reading a Postgres error through the query library's wrapper. Drizzle throws a
 * DrizzleQueryError whose message is the SQL and its parameters (password hashes
 * included, for an account insert) and whose `.cause` is the real database error with
 * its code. So: check codes with dbErrorCode, and never show a wrapped error's message.
 *
 * No server-only import: the scripts use it too.
 */

interface PgErrorFields {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  column?: string;
}

/** The innermost error that carries a Postgres code, looking a few `.cause`s deep. */
export function dbError(error: unknown): PgErrorFields | null {
  for (let e: unknown = error, depth = 0; e && typeof e === "object" && depth < 4; depth += 1) {
    const fields = e as PgErrorFields & { cause?: unknown };
    if (typeof fields.code === "string" && /^[0-9A-Z]{5}$/.test(fields.code)) return fields;
    e = fields.cause;
  }
  return null;
}

export function dbErrorCode(error: unknown): string | undefined {
  return dbError(error)?.code;
}

/** Postgres's 23505: a unique index refused a duplicate. */
export function isUniqueViolation(error: unknown): boolean {
  return dbErrorCode(error) === "23505";
}

/** The database's own words, without the SQL and parameters a wrapper would add. */
export function describeDbError(error: unknown): string {
  const pg = dbError(error);
  if (!pg) return error instanceof Error && !/^Failed query:/.test(error.message) ? error.message : "Unknown database error.";
  return [pg.message, pg.detail, pg.constraint ? `(constraint ${pg.constraint})` : ""].filter(Boolean).join(" ");
}

/**
 * What to tell a person when an action fails. The app's own messages ("That athlete was
 * already deleted.") pass through; a database error becomes `fallback`, with the details
 * logged on the server instead, since the raw message can carry SQL and parameters.
 */
export function userMessage(error: unknown, fallback: string): string {
  if (dbError(error) || (error instanceof Error && /^Failed query:/.test(error.message))) {
    console.error(`Database error: ${describeDbError(error)}`);
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
