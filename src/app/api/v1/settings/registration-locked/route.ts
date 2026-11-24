import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { setRegistrationLocked } from "@/lib/authActions";

export const PUT = api(async (request) => {
  const { data, problem } = await body(request, z.object({ locked: z.boolean() }));
  return problem ?? fromAction(await setRegistrationLocked(data.locked));
});
