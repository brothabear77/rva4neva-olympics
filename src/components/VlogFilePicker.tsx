"use client";

import { useRef, useState } from "react";
import { VLOG_VIDEO_TYPES, vlogContentType } from "@/lib/vlogTypes";

/**
 * The Vlog upload form's file chooser: a Browse button (a hidden file input underneath) that
 * also takes a dropped file. It checks the type and size straight away so a bad pick is
 * explained before anything is sent; the server checks again when the upload is requested.
 */
export function VlogFilePicker({
  maxBytes,
  file,
  onPick,
  disabled = false,
}: {
  maxBytes: number;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Extensions as well as types, so the chooser offers .mov files even where the OS reports no type.
  const accept = [...Object.keys(VLOG_VIDEO_TYPES), ...Object.values(VLOG_VIDEO_TYPES).map((e) => `.${e}`)].join(",");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    if (!vlogContentType(picked)) {
      onPick(null);
      setError("That isn't a video we can take. Use an MP4, MOV or WebM file.");
    } else if (picked.size > maxBytes) {
      onPick(null);
      setError(`That video is over ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    } else {
      onPick(picked);
      setError(null);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) choose(e.dataTransfer.files[0]);
      }}
      className={`rounded-lg border-2 border-dashed px-6 py-10 text-center ${dragging ? "border-paper" : "border-[var(--edge-strong)]"}`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label="Video file"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">
        {file ? file.name : "Drop a video here"}
      </p>
      {file ? (
        <p className="mt-1 text-sm text-muted">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
      ) : (
        <p className="mt-1 text-sm text-muted">MP4, MOV or WebM, up to {Math.round(maxBytes / (1024 * 1024))} MB.</p>
      )}
      <button type="button" disabled={disabled} className="btn btn-ghost mt-4" onClick={() => input.current?.click()}>
        {file ? "Choose a different video" : "Browse"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
