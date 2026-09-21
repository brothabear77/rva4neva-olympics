import {
  formatMeasurement,
  isScorable,
  rawForPoints,
  scoreResult,
  type ScoringConfig,
} from "./scoring";

/**
 * Helpers for the Info pages: the athlete profiles and the event guide.
 *
 * What people write lives in src/content/athletes.ts and src/content/events.ts.
 * This file is the logic around it, kept pure so it can be tested: match what was
 * written to the database rows, work out what kind of media a path or link is, and
 * notice mistakes (a bio for a name nobody has, a link that is not YouTube) that
 * would otherwise just mean something silently never shows up.
 */

// --- what gets written in the content files ---------------------------------

export interface AthleteProfile {
  /** Must match the athlete's name on the roster. Case and extra spaces do not matter. */
  name: string;
  /** A file in public/, e.g. "/athletes/nick.jpg". */
  photo?: string;
  /** One line under the name. */
  tagline?: string;
  /** Free text. A blank line starts a new paragraph. */
  bio?: string;
}

export interface MediaInput {
  /** A file in public/, e.g. "/events/plank-hold.mp4". Photo, GIF or video: the extension says which. */
  src?: string;
  /** A YouTube link, in any of the usual shapes. Wins over `src` if both are given. */
  youtube?: string;
  /** A still shown before a video or YouTube clip is played. */
  poster?: string;
  caption?: string;
  /** What the media shows, for screen readers. Defaults to the caption. */
  alt?: string;
}

export interface EventGuideEntry {
  /** The last part of the event's address: /events/40-yard-dash has the slug "40-yard-dash". */
  slug: string;
  summary?: string;
  /** One rule per line. */
  rules?: string[];
  media?: MediaInput;
}

// --- tidying ------------------------------------------------------------------

/** Trim; an empty or whitespace-only string is "nothing was written". */
function clean(text: string | undefined): string | undefined {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** How names and slugs are compared: ignoring case and the space around and inside. */
function keyOf(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Split free text into paragraphs on blank lines, dropping empty ones. */
export function paragraphs(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Letters for the avatar shown when there is no photo: "Nick" -> "N", "Dana Scully" -> "DS". */
export function initials(name: string): string {
  // Array.from, not indexing, so a name starting with an emoji is not cut in half.
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letter = (word: string) => Array.from(word)[0].toUpperCase();
  return words.length === 1 ? letter(words[0]) : letter(words[0]) + letter(words[words.length - 1]);
}

// --- matching what was written to the database rows ----------------------------

export interface AthleteMerge<T> {
  /** Every roster athlete, in roster order, with their profile if one was written. */
  rows: Array<{ athlete: T; profile: AthleteProfile | null }>;
  /** Profiles whose name matches nobody on the roster: almost always a typo. */
  unmatched: AthleteProfile[];
  /** A second profile for a name that already has one. The first is used. */
  duplicates: AthleteProfile[];
}

export function mergeAthleteProfiles<T extends { name: string }>(
  roster: readonly T[],
  profiles: readonly AthleteProfile[],
): AthleteMerge<T> {
  const byKey = new Map<string, AthleteProfile>();
  const duplicates: AthleteProfile[] = [];

  for (const profile of profiles) {
    const key = keyOf(profile.name ?? "");
    if (!key) continue;
    if (byKey.has(key)) duplicates.push(profile);
    else byKey.set(key, profile);
  }

  const rosterKeys = new Set(roster.map((a) => keyOf(a.name)));
  const unmatched = [...byKey.entries()].filter(([key]) => !rosterKeys.has(key)).map(([, p]) => p);

  return {
    rows: roster.map((athlete) => ({ athlete, profile: byKey.get(keyOf(athlete.name)) ?? null })),
    unmatched,
    duplicates,
  };
}

export interface EventMerge<T> {
  rows: Array<{ event: T; guide: EventGuideEntry | null }>;
  /** Guides whose slug matches no event: a typo, or an event that was renamed. */
  unmatched: EventGuideEntry[];
  duplicates: EventGuideEntry[];
}

export function mergeEventGuides<T extends { slug: string }>(
  events: readonly T[],
  guides: readonly EventGuideEntry[],
): EventMerge<T> {
  const bySlug = new Map<string, EventGuideEntry>();
  const duplicates: EventGuideEntry[] = [];

  for (const guide of guides) {
    const key = keyOf(guide.slug ?? "");
    if (!key) continue;
    if (bySlug.has(key)) duplicates.push(guide);
    else bySlug.set(key, guide);
  }

  const eventKeys = new Set(events.map((e) => keyOf(e.slug)));
  const unmatched = [...bySlug.entries()].filter(([key]) => !eventKeys.has(key)).map(([, g]) => g);

  return {
    rows: events.map((event) => ({ event, guide: bySlug.get(keyOf(event.slug)) ?? null })),
    unmatched,
    duplicates,
  };
}

// --- media ---------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

/** "/events/a.MP4?v=2" -> "mp4". Empty when there is no extension. */
function extensionOf(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0];
  const dot = withoutQuery.lastIndexOf(".");
  const slash = withoutQuery.lastIndexOf("/");
  return dot > slash ? withoutQuery.slice(dot + 1).toLowerCase() : "";
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

/**
 * The video id in a YouTube link, or null if it is not one. Copied links come in
 * many shapes — watch?v=, youtu.be/, /embed/, /shorts/, /live/, with tracking
 * parameters, without the https:// — and a bare 11-character id works too.
 */
export function youtubeId(input: string | undefined): string | null {
  const text = clean(input);
  if (!text) return null;
  if (YOUTUBE_ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;

  if (url.hostname.toLowerCase().endsWith("youtu.be")) id = segments[0];
  else if (segments[0] === "watch") id = url.searchParams.get("v") ?? undefined;
  else if (["embed", "shorts", "live", "v"].includes(segments[0])) id = segments[1];

  return id && YOUTUBE_ID.test(id) ? id : null;
}

interface MediaBase {
  caption?: string;
  /** What to tell a screen reader the media shows. */
  label: string;
}

export type ResolvedMedia =
  | (MediaBase & { kind: "image"; src: string })
  | (MediaBase & { kind: "gif"; src: string })
  | (MediaBase & { kind: "video"; src: string; poster?: string })
  | (MediaBase & { kind: "youtube"; id: string; poster?: string });

/** Work out what a media entry is. Null when there is nothing usable to show. */
export function resolveMedia(input: MediaInput | undefined): ResolvedMedia | null {
  if (!input) return null;

  const caption = clean(input.caption);
  const base = { caption, label: clean(input.alt) ?? caption ?? "Demonstration" };
  const poster = clean(input.poster);

  const id = youtubeId(input.youtube);
  if (id) return { kind: "youtube", id, poster, ...base };

  const src = clean(input.src);
  if (!src) return null;

  const extension = extensionOf(src);
  if (extension === "gif") return { kind: "gif", src, ...base };
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: "image", src, ...base };
  if (VIDEO_EXTENSIONS.has(extension)) return { kind: "video", src, poster, ...base };
  return null;
}

/** Why a media entry will not show, in plain words — or null if it is fine (or absent). */
export function mediaProblem(input: MediaInput | undefined): string | null {
  if (!input) return null;

  const youtube = clean(input.youtube);
  if (youtube && !youtubeId(youtube)) {
    return `"${youtube}" is not a YouTube link that can be read. Paste the address from the browser bar or the Share button.`;
  }

  const src = clean(input.src);
  if (!youtube && !src) return "needs either a src (a file in public/) or a youtube link.";

  if (!youtube && src) {
    const extension = extensionOf(src);
    if (!resolveMedia({ src })) {
      return extension
        ? `".${extension}" is not a file type that can be shown. Use jpg, png, webp, gif, mp4 or webm.`
        : `"${src}" has no file extension, so it cannot tell whether it is a photo, GIF or video.`;
    }
  }
  return null;
}

// --- how an event is scored ----------------------------------------------------

export interface LadderStep {
  points: number;
  /** The mark, formatted for the event: "5.85 s". */
  mark: string;
}

/**
 * A few marks and what they are worth, so the scale is concrete: "4.80 s is 1000,
 * 6.90 s is 500". Each mark is rounded to the event's own precision and then
 * scored again, so the points shown are what that exact mark really earns. An
 * event measured in whole numbers cannot land on every round points value, and
 * saying "13 bags = 750" when 13 bags is 786 would be a small lie.
 */
export function scoreLadder(
  config: ScoringConfig,
  decimals: number,
  unitLabel: string,
  targets: readonly number[] = [1000, 750, 500, 250, 0],
): LadderStep[] {
  if (!isScorable(config)) return [];

  const places = Math.max(0, Math.min(6, decimals));
  const unit = unitLabel ? ` ${unitLabel}` : "";

  return targets.map((target) => {
    const exact = rawForPoints(target, config) ?? 0;
    const mark = Math.round(exact * 10 ** places) / 10 ** places;
    return { points: scoreResult(mark, config), mark: `${formatMeasurement(mark, places)}${unit}` };
  });
}
