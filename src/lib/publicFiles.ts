import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * True when a path written in a content file ("/athletes/nick.jpg") points at
 * nothing in public/. Used to warn about typos while running locally.
 *
 * Only ever call this outside production: a deployed function does not
 * necessarily carry public/ on its own disk (the files are served from the CDN),
 * so "not found" there would be a false alarm.
 */
export function publicFileMissing(webPath: string | undefined): boolean {
  if (!webPath || /^https?:\/\//i.test(webPath)) return false;

  const root = path.join(process.cwd(), "public");
  const file = path.normalize(path.join(root, webPath.split(/[?#]/)[0]));
  // A path that climbs out of public/ is not a valid web path, so treat it as missing.
  if (!file.startsWith(root + path.sep)) return true;
  return !existsSync(file);
}

export const isLocalDev = process.env.NODE_ENV !== "production";
