import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { changeUsername } from "@/lib/authActions";

export const PATCH = api(async (request) => {
  const { data, problem } = await body(request, z.object({ username: z.string() }));
  return problem ?? fromAction(await changeUsername(data));
});
