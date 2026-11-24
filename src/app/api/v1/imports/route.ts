import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { commitImport } from "@/lib/actions";

/** Apply a results CSV. Re-validated here; any bad row blocks the whole import. */
export const POST = api(async (request) => {
  const { data, problem } = await body(
    request,
    z.object({ csv: z.string().max(2_000_000, "That file is too big."), filename: z.string().max(255).default("upload.csv") }),
  );
  return problem ?? fromAction(await commitImport(data.csv, data.filename));
});
