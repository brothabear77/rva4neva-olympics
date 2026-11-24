import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { changePassword } from "@/lib/authActions";

/** Signs out every other session, the website's included; this app's token keeps working. */
export const PATCH = api(async (request) => {
  const { data, problem } = await body(request, z.object({ current: z.string(), password: z.string(), confirm: z.string() }));
  return problem ?? fromAction(await changePassword(data));
});
