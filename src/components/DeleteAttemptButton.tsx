"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteAttempt } from "@/lib/athleteActions";

export function DeleteAttemptButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteAttempt(attemptId);
          router.refresh();
        })
      }
      className="text-xs text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
