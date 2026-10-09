"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishVlogUpload, requestVlogUpload } from "@/lib/vlogActions";
import { VLOG_MAX_BYTES, vlogContentType } from "@/lib/vlogTypes";
import { VlogFilePicker } from "./VlogFilePicker";

type EventOption = { id: string; name: string };

/** Sends `file` to a presigned URL, reporting progress. fetch can't, so this is XMLHttpRequest. */
function putFile(url: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage said ${xhr.status}.`)));
    xhr.onerror = () => reject(new Error("The connection dropped."));
    xhr.send(file);
  });
}

/**
 * The upload form. Three steps: ask the server for a signed URL (which also records the
 * video as pending), send the file straight to storage, then ask the server to confirm it
 * arrived, which is what puts it in the feed. `enabled` is false when storage isn't set up.
 */
export function VlogUploadForm({
  enabled,
  canUpload,
  events,
}: {
  enabled: boolean;
  canUpload: boolean;
  events: EventOption[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const uploading = progress !== null;
  const off = !enabled || !canUpload;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const contentType = file ? vlogContentType(file) : null;
    if (!file || !contentType) return setMessage({ ok: false, text: "Choose a video first." });
    setMessage(null);
    setProgress(0);
    try {
      const requested = await requestVlogUpload({
        title,
        eventId: eventId || null,
        contentType,
        sizeBytes: file.size,
      });
      if (!requested.ok || !requested.data) throw new Error(requested.message);
      await putFile(requested.data.uploadUrl, file, contentType, setProgress);
      const finished = await finishVlogUpload(requested.data.videoId);
      if (!finished.ok) throw new Error(finished.message);
      setFile(null);
      setTitle("");
      setEventId("");
      setMessage({ ok: true, text: "Uploaded. It's in the feed below." });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "The upload failed. Try again." });
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-6">
      <VlogFilePicker maxBytes={VLOG_MAX_BYTES} file={file} onPick={setFile} disabled={off || uploading} />
      <div>
        <label className="label" htmlFor="vlogTitle">
          Title
        </label>
        <input
          id="vlogTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          disabled={off || uploading}
          placeholder="What happened in this clip?"
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="vlogEvent">
          Event <span className="text-muted">(optional)</span>
        </label>
        <select
          id="vlogEvent"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          disabled={off || uploading}
          className="field"
        >
          <option value="">Not tied to an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={off || uploading || !file || !title.trim()} className="btn">
          {uploading ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : "Upload"}
        </button>
        {uploading ? (
          <progress value={progress ?? 0} max={1} aria-label="Upload progress" className="h-2 w-40" />
        ) : null}
        {!enabled ? <span className="text-sm text-muted">Video storage isn&apos;t set up here.</span> : null}
        {enabled && !canUpload ? <span className="text-sm text-muted">Only athletes can upload.</span> : null}
        {message ? (
          <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-muted" : "text-red-200"}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
