import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { vlogHearts } from "./schema";

export type HeartSummary = { count: number; mine: boolean };

/**
 * Heart counts for the given videos, and whether `athleteId` (if signed in as an athlete)
 * has hearted each. A video nobody has hearted is absent: read it as zero.
 */
export async function heartSummaries(videoIds: string[], athleteId: string | null): Promise<Map<string, HeartSummary>> {
  const summaries = new Map<string, HeartSummary>();
  if (videoIds.length === 0) return summaries;

  const totals = await db
    .select({ videoId: vlogHearts.videoId, n: count() })
    .from(vlogHearts)
    .where(inArray(vlogHearts.videoId, videoIds))
    .groupBy(vlogHearts.videoId);
  for (const t of totals) summaries.set(t.videoId, { count: t.n, mine: false });

  if (athleteId) {
    const mine = await db
      .select({ videoId: vlogHearts.videoId })
      .from(vlogHearts)
      .where(and(eq(vlogHearts.athleteId, athleteId), inArray(vlogHearts.videoId, videoIds)));
    for (const m of mine) {
      const existing = summaries.get(m.videoId);
      if (existing) existing.mine = true;
    }
  }
  return summaries;
}
