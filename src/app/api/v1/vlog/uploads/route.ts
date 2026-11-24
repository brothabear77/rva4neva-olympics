import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { requestVlogUpload } from "@/lib/vlogActions";

/**
 * Step one of an upload: returns `{ videoId, uploadUrl }`. The app PUTs the file straight to
 * storage with exactly this Content-Type and size (both are signed), then calls finish.
 */
export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({
      title: z.string(),
      eventId: z.string().nullable().default(null),
      confession: z.boolean().default(false),
      contentType: z.string(),
      sizeBytes: z.number(),
    }),
  );
  return problem ?? fromAction(await requestVlogUpload(data));
});
