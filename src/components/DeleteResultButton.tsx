"use client";

import { useActionState, useState } from "react";
import { deleteResult } from "@/lib/actions";
import { useScorekeeperName } from "./useScorekeeperName";
import type { ActionResult } from "@/lib/actions";

/**
 * Remove a result.
 *
 * Confirmation is a second click on an inline control rather than a
 * `window.confirm`, which is easy to dismiss by reflex on a phone. Deleting is
 * recoverable in any case: the row and its full prior state are in the change
 * history, and restoring puts it back under its original id.
 */
export function DeleteResultButton({
  resultId,
  athleteName,
}: {
  resultId: string;
  athleteName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [name] = useScorekeeperName();
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => deleteResult(formData),
    null,
  );

  if (state && !state.ok) {
    return <span className="text-xs text-muted">{state.message}</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center justify-end gap-2">
      <input type="hidden" name="resultId" value={resultId} />
      <input type="hidden" name="submittedBy" value={name} />
      <span className="text-xs text-muted">Remove {athleteName}?</span>
      <button type="submit" disabled={pending} className="text-xs font-semibold text-accent hover:underline">
        {pending ? "Removing…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-muted hover:text-paper"
      >
        No
      </button>
    </form>
  );
}
