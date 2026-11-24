/**
 * The bearer token in an `Authorization` header, or null.
 *
 * Tokens are 32 random bytes as base64url (43 characters, see issueSessionToken in
 * auth.ts); anything that isn't shaped like one is ignored rather than looked up.
 * Kept apart from auth.ts, which is server-only, so it can be unit tested.
 */
export function parseBearer(header: string | null | undefined): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]{16,256})\s*$/i.exec(header ?? "");
  return match ? match[1] : null;
}
