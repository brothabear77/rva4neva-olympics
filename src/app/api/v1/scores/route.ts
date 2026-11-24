import { z } from "zod";
import { api, body, fromAction, json, refused } from "@/lib/api";
import { canScore, getSession } from "@/lib/auth";
import { submitGrid } from "@/lib/actions";
import { submissionsLocked } from "@/lib/flags";
import { getAthletes, getEventsForForm, getResultValues } from "@/lib/queries";

/** What the score grid needs: events, the roster, every stored value, and whether scores are frozen. */
export const GET = api(async () => {
  const session = await getSession();
  if (!canScore(session)) return refused(session);
  const [events, athletes, values, locked] = await Promise.all([
    getEventsForForm(),
    getAthletes(),
    getResultValues(),
    submissionsLocked(),
  ]);
  return json({ events, athletes: athletes.map((a) => ({ id: a.id, name: a.name })), values, locked });
});

/** Add or replace scores: `{ changes: [{athleteId, athleteName, eventId, value}] }`, all in one transaction. */
export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({
      changes: z.array(z.object({ athleteId: z.string(), athleteName: z.string(), eventId: z.string(), value: z.number() })),
    }),
  );
  return problem ?? fromAction(await submitGrid(data));
});
