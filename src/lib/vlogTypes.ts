/**
 * What the Vlog accepts, in a file both the browser and the server can import (vlogMedia.ts
 * is server-only). The upload form checks with these; the server checks again.
 */

/** Containers a phone or a screen recorder produces, and the extension each is stored under. */
export const VLOG_VIDEO_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Largest clip accepted, in bytes. Enforced by the presigned upload, not just the form. */
export const VLOG_MAX_BYTES = 500 * 1024 * 1024;

/**
 * The accepted content type for a picked file, or null. Browsers often report a .mov (and
 * sometimes others) with an empty or generic type, so when the reported type isn't one we
 * take, the extension decides.
 */
export function vlogContentType(file: { name: string; type: string }): string | null {
  if (file.type in VLOG_VIDEO_TYPES) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Object.entries(VLOG_VIDEO_TYPES).find(([, e]) => e === ext)?.[0] ?? null;
}
