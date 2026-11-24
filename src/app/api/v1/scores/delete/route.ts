import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { deleteScores } from "@/lib/actions";

/** Remove scores: `{ cells: [{athleteId, athleteName, eventId}] }`. A POST, since DELETE bodies are unreliable. */
export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({ cells: z.array(z.object({ athleteId: z.string(), athleteName: z.string(), eventId: z.string() })) }),
  );
  return problem ?? fromAction(await deleteScores(data));
});
