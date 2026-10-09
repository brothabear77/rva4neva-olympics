import "server-only";
import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { athletes, events, vlogVideos } from "./schema";
import { heartSummaries } from "./vlogHearts";
import { signPlayback } from "./vlogMedia";
import type { VlogItem } from "@/components/VlogGrid";

/**
 * Every uploaded video, newest first, ready for the page: playback URL signed, hearts
 * counted, and whether the viewer may delete it (their own, or anything for the admin).
 * Uploads still in progress are not listed.
 */
export async function getVlogItems(viewer: { athleteId: string | null; isAdmin: boolean }): Promise<VlogItem[]> {
  const rows = await db
    .select({
      id: vlogVideos.id,
      title: vlogVideos.title,
      objectKey: vlogVideos.objectKey,
      uploadedAt: vlogVideos.uploadedAt,
      athleteId: vlogVideos.athleteId,
      athleteName: athletes.name,
      eventName: events.name,
    })
    .from(vlogVideos)
    .innerJoin(athletes, eq(athletes.id, vlogVideos.athleteId))
    .leftJoin(events, eq(events.id, vlogVideos.eventId))
    .where(isNotNull(vlogVideos.uploadedAt))
    .orderBy(desc(vlogVideos.uploadedAt));

  const hearts = await heartSummaries(
    rows.map((r) => r.id),
    viewer.athleteId,
  );
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      athleteName: r.athleteName,
      eventName: r.eventName ?? undefined,
      src: await signPlayback(r.objectKey),
      postedAt: r.uploadedAt!.toISOString(),
      hearts: hearts.get(r.id)?.count ?? 0,
      hearted: hearts.get(r.id)?.mine ?? false,
      canDelete: viewer.isAdmin || r.athleteId === viewer.athleteId,
    })),
  );
}
