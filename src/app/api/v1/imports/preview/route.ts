import { z } from "zod";
import { api, body, fromAction } from "@/lib/api";
import { previewImport } from "@/lib/actions";

/** Check a results CSV without writing anything: what each row would do, and any errors. */
export const POST = api(async (request) => {
  const { data, problem } = await body(request, z.object({ csv: z.string().max(2_000_000, "That file is too big.") }));
  return problem ?? fromAction(await previewImport(data.csv));
});
