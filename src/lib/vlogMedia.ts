import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Where the Vlog page's videos live: a private S3 bucket.
 *
 * The browser sends and fetches video bytes straight to and from S3 with short-lived
 * presigned URLs, so a 500 MB clip never passes through the app's small instance. The app
 * only signs those URLs, then checks and deletes objects.
 *
 * Production reads `VLOG_MEDIA_BUCKET` (set by the CDK stack) and signs with the App Runner
 * instance role. Local development points the same code at S3Mock from docker-compose:
 * `VLOG_MEDIA_ENDPOINT` selects it, and with it path-style addresses and the keys in
 * VLOG_MEDIA_ACCESS_KEY_ID / VLOG_MEDIA_SECRET_ACCESS_KEY. Those are deliberately not the
 * standard AWS_* names: the deploy scripts load .env files too, and a throwaway local key
 * under AWS_ACCESS_KEY_ID would be mistaken for the real AWS login. With no bucket set, `vlogMediaConfigured()` is
 * false and the page keeps uploads switched off.
 */

/** What the production secret or env var holds until a real bucket exists, as with Spotify. */
const PLACEHOLDER = "not-provisioned-yet";

import { VLOG_MAX_BYTES, VLOG_VIDEO_TYPES } from "./vlogTypes";

export { VLOG_MAX_BYTES, VLOG_VIDEO_TYPES };

/** Every object lives under this prefix, so a bucket policy or lifecycle rule can target it. */
export const VLOG_KEY_PREFIX = "vlog/";

export type VlogMediaConfig = {
  bucket: string;
  region: string;
  /** Set only for a local S3 stand-in such as S3Mock. Unset means real S3. */
  endpoint?: string;
};

/** How long a signed upload or playback URL works. The page is rendered fresh on every visit. */
const UPLOAD_URL_SECONDS = 60 * 60;
const PLAYBACK_URL_SECONDS = 60 * 60;

export function vlogMediaConfig(): VlogMediaConfig | null {
  const bucket = process.env.VLOG_MEDIA_BUCKET?.trim();
  if (!bucket || bucket === PLACEHOLDER) return null;
  const endpoint = process.env.VLOG_MEDIA_ENDPOINT?.trim();
  return { bucket, region: process.env.AWS_REGION?.trim() || "us-east-1", ...(endpoint ? { endpoint } : {}) };
}

/** Whether a bucket has been set up. The upload form stays disabled while this is false. */
export function vlogMediaConfigured(): boolean {
  return vlogMediaConfig() !== null;
}

/** The object key for a new upload: `vlog/<athlete id>/<random id>.<ext>`, or null for a type we don't take. */
export function vlogObjectKey(athleteId: string, contentType: string): string | null {
  const ext = VLOG_VIDEO_TYPES[contentType];
  if (!ext) return null;
  return `${VLOG_KEY_PREFIX}${athleteId}/${randomUUID()}.${ext}`;
}

const globalForS3 = globalThis as unknown as { __olympicsS3?: S3Client };

function client(config: VlogMediaConfig): S3Client {
  // Reused across requests (and dev reloads), like the database pool.
  globalForS3.__olympicsS3 ??= new S3Client({
    region: config.region,
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.VLOG_MEDIA_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.VLOG_MEDIA_SECRET_ACCESS_KEY ?? "",
          },
        }
      : {}),
    // The presigner would otherwise add checksum parameters a browser's plain PUT can't satisfy.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return globalForS3.__olympicsS3;
}

function required(): { s3: S3Client; bucket: string } {
  const config = vlogMediaConfig();
  if (!config) throw new Error("Vlog storage is not configured (VLOG_MEDIA_BUCKET is unset).");
  return { s3: client(config), bucket: config.bucket };
}

/**
 * A URL the browser can PUT the file to. The content type and exact length are part of the
 * signature, so S3 refuses anything that doesn't match what the athlete asked for: the
 * size limit is enforced there, not only in the form.
 */
export async function signUpload(key: string, contentType: string, sizeBytes: number): Promise<string> {
  const { s3, bucket } = required();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: UPLOAD_URL_SECONDS, unhoistableHeaders: new Set(["content-length"]) },
  );
}

/** A URL the browser can play the video from. */
export async function signPlayback(key: string): Promise<string> {
  const { s3, bucket } = required();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: PLAYBACK_URL_SECONDS });
}

/** The stored object's size in bytes, or null if there is no such object. */
export async function storedSize(key: string): Promise<number | null> {
  const { s3, bucket } = required();
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** Removes the object. Deleting one that isn't there is not an error. */
export async function deleteStored(key: string): Promise<void> {
  const { s3, bucket } = required();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
