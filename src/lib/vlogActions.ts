"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { canEditAthlete, getSession, refusal, type Session } from "./auth";
import { events, vlogHearts, vlogVideos } from "./schema";
import { showVlogPage } from "./flags";
import { gamesFinished } from "./queries";
import { VLOG_MAX_BYTES, VLOG_VIDEO_TYPES, deleteStored, signUpload, storedSize, vlogMediaConfigured, vlogObjectKey } from "./vlogMedia";
import type { ActionResult } from "./actions";

/**
 * The Vlog's writes: asking to upload, confirming an upload, deleting a video, hearting.
 * Each checks the signed-in account itself, and each refuses while the "show-vlog-page"
 * flag is off: hiding the page alone would leave these callable by anyone signed in, and
 * an upload costs money. These tables are not audited.
 */

const ok = <T>(message: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
const fail = (message: string): ActionResult<never> => ({ ok: false, message });

const MAX_VLOG_TITLE_LENGTH = 120;
/** An upload that never got confirmed is cleaned up once it is older than this. */
const STALE_PENDING_MS = 2 * 60 * 60 * 1000;

const NOT_AVAILABLE = "Vlog uploads aren't available right now.";

async function athleteSession(): Promise<(Session & { athleteId: string }) | null> {
  const session = await getSession();
  return session?.athleteId ? (session as Session & { athleteId: string }) : null;
}

/** Deletes an object, tolerating failure: a leftover file is a smaller problem than a failed request. */
async function deleteQuietly(key: string) {
  try {
    await deleteStored(key);
  } catch (error) {
    console.warn(`Could not delete Vlog object "${key}": ${(error as Error).message}`);
  }
}

/**
 * Step one of an upload: records the video as pending and hands back a URL the browser
 * PUTs the file to. The file never passes through the app.
 */
export async function requestVlogUpload(input: {
  title: string;
  eventId: string | null;
  /** Tagged "Confession": kept private to the uploader until the games are finished. */
  confession?: boolean;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ videoId: string; uploadUrl: string }>> {
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Give the video a title.").max(MAX_VLOG_TITLE_LENGTH, "That title is too long."),
      eventId: z.string().uuid().nullable(),
      confession: z.boolean().default(false),
      contentType: z.string().refine((t) => t in VLOG_VIDEO_TYPES, "Use an MP4, MOV or WebM video."),
      sizeBytes: z
        .number()
        .int()
        .gt(0, "That file is empty.")
        .max(VLOG_MAX_BYTES, `Videos can be up to ${VLOG_MAX_BYTES / (1024 * 1024)} MB.`),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the video and try again.");

  const session = await athleteSession();
  if (!session) return fail(await refusal());
  if (!(await showVlogPage()) || !vlogMediaConfigured()) return fail(NOT_AVAILABLE);

  const { title, contentType, sizeBytes, confession } = parsed.data;
  // A confession is its own tag, not an event.
  const eventId = confession ? null : parsed.data.eventId;
  if (eventId) {
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return fail("That event no longer exists.");
  }

  // Housekeeping: this athlete's earlier uploads that were started but never confirmed.
  const stale = await db
    .select({ id: vlogVideos.id, objectKey: vlogVideos.objectKey })
    .from(vlogVideos)
    .where(
      and(
        eq(vlogVideos.athleteId, session.athleteId),
        isNull(vlogVideos.uploadedAt),
        lt(vlogVideos.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
      ),
    );
  for (const old of stale) {
    await deleteQuietly(old.objectKey);
    await db.delete(vlogVideos).where(eq(vlogVideos.id, old.id));
  }

  const objectKey = vlogObjectKey(session.athleteId, contentType);
  if (!objectKey) return fail("Use an MP4, MOV or WebM video.");
  const [video] = await db
    .insert(vlogVideos)
    .values({ athleteId: session.athleteId, eventId, confession, title, objectKey, contentType, sizeBytes })
    .returning({ id: vlogVideos.id });

  try {
    const uploadUrl = await signUpload(objectKey, contentType, sizeBytes);
    return ok("Ready to upload.", { videoId: video.id, uploadUrl });
  } catch (error) {
    await db.delete(vlogVideos).where(eq(vlogVideos.id, video.id));
    console.error(`Could not sign a Vlog upload: ${(error as Error).message}`);
    return fail("Couldn't start the upload. Try again in a moment.");
  }
}

/** Step two: checks the file arrived whole, then publishes the video to the feed. */
export async function finishVlogUpload(videoId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(videoId).success) return fail("That upload no longer exists.");
  const session = await athleteSession();
  if (!session) return fail(await refusal());
  if (!(await showVlogPage()) || !vlogMediaConfigured()) return fail(NOT_AVAILABLE);

  const [video] = await db
    .select()
    .from(vlogVideos)
    .where(and(eq(vlogVideos.id, videoId), eq(vlogVideos.athleteId, session.athleteId)))
    .limit(1);
  if (!video) return fail("That upload no longer exists.");
  if (video.uploadedAt) return ok("Already uploaded.");

  let size: number | null;
  try {
    size = await storedSize(video.objectKey);
  } catch (error) {
    console.error(`Could not check a Vlog upload: ${(error as Error).message}`);
    return fail("Couldn't confirm the upload. Try again in a moment.");
  }
  if (size === null) return fail("The upload didn't arrive. Try again.");
  if (size !== video.sizeBytes) {
    await deleteQuietly(video.objectKey);
    await db.delete(vlogVideos).where(eq(vlogVideos.id, video.id));
    return fail("The upload was incomplete. Try again.");
  }

  await db.update(vlogVideos).set({ uploadedAt: new Date() }).where(eq(vlogVideos.id, video.id));
  revalidatePath("/athletes/vlog");
  return ok("Video uploaded.");
}

/** The uploader removes their own video; the admin can remove anyone's. Its hearts go with it. */
export async function deleteVlogVideo(videoId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(videoId).success) return fail("That video no longer exists.");
  const session = await getSession();
  if (!session) return fail(await refusal());
  if (!(await showVlogPage())) return fail(NOT_AVAILABLE);

  const [video] = await db.select().from(vlogVideos).where(eq(vlogVideos.id, videoId)).limit(1);
  if (!video) return fail("That video no longer exists.");
  if (!canEditAthlete(session, video.athleteId)) return fail(await refusal());

  await db.delete(vlogVideos).where(eq(vlogVideos.id, video.id));
  if (vlogMediaConfigured()) await deleteQuietly(video.objectKey);
  revalidatePath("/athletes/vlog");
  return ok("Video removed.");
}

/**
 * Hearts or un-hearts a video as the signed-in athlete. It states the wanted outcome
 * rather than flipping, so a double click or a second tab can't undo itself.
 */
export async function setHeart(input: { videoId: string; hearted: boolean }): Promise<ActionResult> {
  const parsed = z.object({ videoId: z.string().uuid(), hearted: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("That video no longer exists.");

  const session = await athleteSession();
  if (!session) return fail(await refusal());
  if (!(await showVlogPage())) return fail(NOT_AVAILABLE);

  const { videoId, hearted } = parsed.data;
  if (hearted) {
    const [video] = await db
      .select({ id: vlogVideos.id, athleteId: vlogVideos.athleteId, confession: vlogVideos.confession })
      .from(vlogVideos)
      .where(eq(vlogVideos.id, videoId))
      .limit(1);
    if (!video) return fail("That video no longer exists.");
    // Nobody can see a confession yet, so nobody can heart it.
    if (video.confession && !(await gamesFinished())) return fail("That video no longer exists.");
    await db.insert(vlogHearts).values({ videoId, athleteId: session.athleteId }).onConflictDoNothing();
  } else {
    await db
      .delete(vlogHearts)
      .where(and(eq(vlogHearts.videoId, videoId), eq(vlogHearts.athleteId, session.athleteId)));
  }
  revalidatePath("/athletes/vlog");
  return ok(hearted ? "Hearted." : "Heart removed.");
}
