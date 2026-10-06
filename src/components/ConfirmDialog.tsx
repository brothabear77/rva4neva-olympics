"use client";

import { useEffect, useId, useRef } from "react";

/**
 * A modal "are you sure?" on the native <dialog>, which brings the backdrop, focus
 * handling and Escape-to-close. `onCancel` runs for Cancel, Escape and a click on
 * the backdrop; the caller closes it on success by setting `open` to false.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // One per instance: every proposal card renders its own dialog.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: let our state close it, not the browser, so the two can't disagree.
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself, not on anything inside it.
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-[var(--edge-strong)] bg-ink p-0 text-paper shadow-lg backdrop:bg-black/60"
    >
      <div className="space-y-4 p-6">
        <h2 id={titleId} className="font-display text-xl font-bold uppercase tracking-wide text-paper">
          {title}
        </h2>
        <div className="text-sm text-muted">{children}</div>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="btn">
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
