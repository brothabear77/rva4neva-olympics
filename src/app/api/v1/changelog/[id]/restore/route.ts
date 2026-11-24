import { api, fromAction } from "@/lib/api";
import { restoreChange } from "@/lib/actions";

/** Undo one entry: puts back the value before it. Adds a new entry; history is never rewritten. */
export const POST = api(async (_request: Request, ctx: RouteContext<"/api/v1/changelog/[id]/restore">) => {
  const { id } = await ctx.params;
  const form = new FormData();
  form.set("entryId", id);
  return fromAction(await restoreChange(form));
});
