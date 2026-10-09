import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Where the Vlog page's videos will live: an S3 bucket that does not exist yet.
 *
 * The bucket is only created once athletes start claiming their profiles (see "Vlog
 * media" in infra/aws.md). Until then nothing here talks to AWS: `VLOG_MEDIA_BUCKET` is
 * unset, `vlogMediaConfigured()` is false, and the page keeps saying uploads are coming.
 * When the bucket exists, setting that one variable is what turns this on.
 */

/** What the production secret or env var holds until a real bucket exists, as with Spotify. */
const PLACEHOLDER = "not-provisioned-yet";

/** Containers a phone or a screen recorder produces, and the extension each is stored under. */
export const VLOG_VIDEO_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Largest clip accepted, in bytes. Enforced by the presigned upload, not just the form. */
export const VLOG_MAX_BYTES = 500 * 1024 * 1024;

/** Every object lives under this prefix, so a bucket policy or lifecycle rule can target it. */
export const VLOG_KEY_PREFIX = "vlog/";

export type VlogMediaConfig = { bucket: string; region: string };

export function vlogMediaConfig(): VlogMediaConfig | null {
  const bucket = process.env.VLOG_MEDIA_BUCKET?.trim();
  if (!bucket || bucket === PLACEHOLDER) return null;
  return { bucket, region: process.env.AWS_REGION?.trim() || "us-east-1" };
}

/** Whether a bucket has been set up. The upload form stays disabled while this is false. */
export function vlogMediaConfigured(): boolean {
  return vlogMediaConfig() !== null;
}

/** The object key for a new upload: `vlog/<athlete id>/<random id>.<ext>`, or null for a type we don't take. */
export function vlogObjectKey(athleteId: number, contentType: string): string | null {
  const ext = VLOG_VIDEO_TYPES[contentType];
  if (!ext) return null;
  return `${VLOG_KEY_PREFIX}${athleteId}/${randomUUID()}.${ext}`;
}
