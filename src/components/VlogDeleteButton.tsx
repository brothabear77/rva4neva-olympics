"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVlogVideo } from "@/lib/vlogActions";
import { ConfirmDialog } from "./ConfirmDialog";

/** Removes a video (its uploader, or the admin) after a confirmation. The server checks again. */
export function VlogDeleteButton({ videoId, title }: { videoId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    start(async () => {
      const result = await deleteVlogVideo(videoId);
      setOpen(false);
      if (!result.ok) setError(result.message);
      router.refresh();
    });

  return (
    <>
      <button type="button" disabled={pending} onClick={() => setOpen(true)} className="text-sm text-muted hover:text-paper">
        Delete
      </button>
      {error ? <span className="text-sm text-red-200">{error}</span> : null}
      <ConfirmDialog
        open={open}
        title="Delete this video?"
        confirmLabel="Yes, delete"
        busyLabel="Deleting…"
        busy={pending}
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      >
        “{title}” and its hearts are deleted. This can&apos;t be undone.
      </ConfirmDialog>
    </>
  );
}
