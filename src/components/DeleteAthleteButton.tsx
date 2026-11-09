"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAthlete } from "@/lib/authActions";
import { ConfirmDialog } from "./ConfirmDialog";
import { Banner } from "./ui";

/** Admin only: delete an athlete completely, account and all. The server checks the admin role again. */
export function DeleteAthleteButton({ athleteId, name }: { athleteId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, startWorking] = useTransition();

  const confirm = () =>
    startWorking(async () => {
      const result = await deleteAthlete(athleteId);
      setOpen(false);
      if (!result.ok) return setError(result.message);
      router.push("/info/athletes");
      router.refresh();
    });

  return (
    <div className="mt-6 space-y-3 border-t border-[var(--edge)] pt-6">
      {error ? <Banner tone="error">{error}</Banner> : null}
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        Delete athlete
      </button>

      <ConfirmDialog
        open={open}
        title={`Delete ${name}?`}
        confirmLabel="Yes, delete"
        busyLabel="Deleting…"
        busy={working}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        Their account, profile, walkout song, scores, practice log, votes, proposals and videos all go, and they disappear from every event.
        This can&apos;t be undone, including from Change History.
      </ConfirmDialog>
    </div>
  );
}
