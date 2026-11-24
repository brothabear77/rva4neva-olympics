import { api, error, json, refuseUnlessMember } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import { showVlogPage } from "@/lib/flags";
import { getEventsForForm } from "@/lib/queries";
import { getVlogItems } from "@/lib/vlogFeed";
import { VLOG_MAX_BYTES, VLOG_VIDEO_TYPES, vlogMediaConfigured } from "@/lib/vlogMedia";

/**
 * The Vlog: the feed and the confessions, with playback URLs signed for an hour. Like the
 * page, it doesn't exist while the "show-vlog-page" flag is off.
 */
export const GET = api(async () => {
  if (!(await showVlogPage())) return error("The Vlog isn't open yet.", 404);
  const session = await getSession();
  const refused = refuseUnlessMember(session);
  if (refused || !session) return refused!;

  const configured = vlogMediaConfigured();
  const viewer = { athleteId: session.athleteId, isAdmin: isAdmin(session) };
  const [feed, confessions, events] = await Promise.all([
    configured ? getVlogItems(viewer) : { items: [], isPublic: true },
    configured ? getVlogItems(viewer, true) : { items: [], isPublic: false },
    getEventsForForm(),
  ]);

  return json({
    configured,
    // Athletes only: the admin and scorekeepers watch but don't upload.
    canUpload: configured && session.role === "athlete" && session.athleteId !== null,
    limits: { maxBytes: VLOG_MAX_BYTES, contentTypes: Object.keys(VLOG_VIDEO_TYPES) },
    events: events.map((e) => ({ id: e.id, name: e.name })),
    videos: feed.items,
    confessions: { items: confessions.items, isPublic: confessions.isPublic },
  });
});
