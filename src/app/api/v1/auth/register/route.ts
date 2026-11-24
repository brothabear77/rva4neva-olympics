import { z } from "zod";
import { api, body, error, json } from "@/lib/api";
import { registerAthlete } from "@/lib/accountCore";
import { issueSessionToken, sessionForToken } from "@/lib/auth";
import { meView } from "@/lib/apiViews";

/** Sign up as a new athlete from the app, and sign in: same rules as /register. */
export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({ name: z.string(), username: z.string(), password: z.string(), confirm: z.string() }),
  );
  if (problem) return problem;

  const result = await registerAthlete(data);
  if (!result.ok || !result.data) return error(result.message);

  const { token, expiresAt } = await issueSessionToken(result.data.accountId);
  return json({ token, expiresAt, message: result.message, ...(await meView(await sessionForToken(token))) }, 201);
});
