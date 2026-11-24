import { z } from "zod";
import { api, body, error, fromAction, json, refuseUnlessMember } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { logAttempt } from "@/lib/athleteActions";
import { getEventsForForm, getPracticeAttempts } from "@/lib/queries";
import { todayInEventZone } from "@/lib/time";

/**
 * Your practice log (private to you). The admin, who has no athlete of their own,
 * reads anyone's with ?athlete=<id>.
 */
export const GET = api(async (request) => {
  const session = await getSession();
  const refused = refuseUnlessMember(session);
  if (refused || !session) return refused!;

  const asked = new URL(request.url).searchParams.get("athlete");
  const athleteId = session.role === "admin" && asked && z.string().uuid().safeParse(asked).success ? asked : session.athleteId;
  if (!athleteId) return error("Pick an athlete to see their practice log.");

  const [events, attempts] = await Promise.all([getEventsForForm(), getPracticeAttempts(athleteId)]);
  return json({ athleteId, today: todayInEventZone(), events, attempts });
});

export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({ eventId: z.string(), value: z.number(), attemptedOn: z.string(), notes: z.string().default("") }),
  );
  return problem ?? fromAction(await logAttempt(data));
});
