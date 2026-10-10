import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { athletes, events, vlogVideos } from "./schema";
import { heartSummaries } from "./vlogHearts";
import { signPlayback } from "./vlogMedia";
import { gamesFinished } from "./queries";
import type { VlogItem } from "@/components/VlogGrid";

/** The label confession videos carry where an event name would go. */
export const CONFESSION_LABEL = "Confession";

/**
 * Every uploaded video, newest first, ready for the page: playback URL signed, hearts
 * counted, and whether the viewer may delete it (their own, or anything for the admin).
 * Uploads still in progress are not listed.
 *
 * `confession` picks which feed: regular videos, or confessions. Confessions are private
 * to their uploader until the games are finished, and `isPublic` says whether that has
 * happened, so the page can hold back hearts until then.
 */
export async function getVlogItems(
  viewer: { athleteId: string | null; isAdmin: boolean },
  confession = false,
): Promise<{ items: VlogItem[]; isPublic: boolean }> {
  const isPublic = !confession || (await gamesFinished());
  // Not yet public and no athlete to show their own: nothing.
  if (!isPublic && !viewer.athleteId) return { items: [], isPublic };

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
    .where(
      and(
        isNotNull(vlogVideos.uploadedAt),
        eq(vlogVideos.confession, confession),
        // A private confession is only ever fetched for the athlete who made it.
        isPublic || !viewer.athleteId ? undefined : eq(vlogVideos.athleteId, viewer.athleteId),
      ),
    )
    .orderBy(desc(vlogVideos.uploadedAt));

  const hearts = await heartSummaries(
    rows.map((r) => r.id),
    viewer.athleteId,
  );
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      athleteName: r.athleteName,
      eventName: confession ? CONFESSION_LABEL : (r.eventName ?? undefined),
      src: await signPlayback(r.objectKey),
      postedAt: r.uploadedAt!.toISOString(),
      hearts: hearts.get(r.id)?.count ?? 0,
      hearted: hearts.get(r.id)?.mine ?? false,
      canDelete: viewer.isAdmin || r.athleteId === viewer.athleteId,
      private: !isPublic,
    })),
  );
  return { items, isPublic };
}
