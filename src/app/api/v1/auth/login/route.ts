import { z } from "zod";
import { api, body, error, json } from "@/lib/api";
import { checkLogin } from "@/lib/accountCore";
import { issueSessionToken, sessionForToken } from "@/lib/auth";
import { meView } from "@/lib/apiViews";
import { statusForFailure } from "@/lib/apiStatus";

/** Sign in from the app: the session token comes back in the body, never as a cookie. */
export const POST = api(async (request) => {
  const { data, problem } = await body(request, z.object({ username: z.string(), password: z.string() }));
  if (problem) return problem;

  const result = await checkLogin(data);
  if (!result.ok || !result.data) return error(result.message, statusForFailure(result.message));

  const { token, expiresAt } = await issueSessionToken(result.data.accountId);
  return json({ token, expiresAt, ...(await meView(await sessionForToken(token))) });
});
