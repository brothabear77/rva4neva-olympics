"use client";

import { useRef, useState, useTransition } from "react";
import { commitImport, previewImport } from "@/lib/actions";
import { CSV_TEMPLATE, type ImportPreview, type PreviewRow } from "@/lib/csv";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";
import { formatMeasurement } from "@/lib/scoring";

/**
 * Bulk import.
 *
 * Nothing is written until the plan below has been reviewed and confirmed. The
 * server re-validates on commit rather than trusting this preview, since the
 * scoreboard may have moved on between the two steps.
 */
export function CsvUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useScorekeeperName();
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setCsvText("");
    setFilename("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const loadFile = async (file: File) => {
    setMessage(null);
    const text = await file.text();
    setCsvText(text);
    setFilename(file.name);

    startTransition(async () => {
      const result = await previewImport(text);
      setPreview(result.data ?? null);
      if (!result.ok) setMessage({ tone: "error", text: result.message });
    });
  };

  const commit = () => {
    startTransition(async () => {
      const result = await commitImport(csvText, filename, name);
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) reset();
    });
  };

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="csvBy">
          Your name
        </label>
        <input
          id="csvBy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Recorded against every row in the change history"
          className="field"
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void loadFile(file);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-accent bg-accent/5" : "border-[var(--edge-strong)]",
        ].join(" ")}
      >
        <p className="font-display text-base font-semibold uppercase tracking-wide text-paper">
          Drop a CSV here
        </p>
        <p className="mt-1 text-sm text-muted">or</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn btn-ghost mt-3"
          disabled={pending}
        >
          Choose a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
        {filename ? <p className="mt-3 text-xs text-muted">{filename}</p> : null}
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-paper">
          What should the file look like?
        </summary>
        <p className="mt-3 text-sm text-muted">
          One row per score. Column names are flexible — <code>event</code>,{" "}
          <code>athlete</code> and <code>value</code> work as well as the full
          names. Use an event&apos;s slug or its display name.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-[var(--edge)] bg-ink p-3 text-xs text-paper">
          {CSV_TEMPLATE}
        </pre>
        <a href={templateHref} download="rva4neva-results-template.csv" className="btn btn-ghost mt-3">
          Download template
        </a>
      </details>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      {preview ? <ImportPreviewPanel preview={preview} /> : null}

      {preview ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={commit}
            className="btn"
            disabled={pending || !preview.canCommit}
          >
            {pending
              ? "Importing…"
              : `Import ${preview.counts.create + preview.counts.update} result${
                  preview.counts.create + preview.counts.update === 1 ? "" : "s"
                }`}
          </button>
          <button type="button" onClick={reset} className="btn btn-ghost" disabled={pending}>
            Discard
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ImportPreviewPanel({ preview }: { preview: ImportPreview }) {
  const { counts } = preview;

  return (
    <div className="space-y-4">
      {preview.missingColumns.length > 0 ? (
        <Banner tone="error">
          The file is missing required column{preview.missingColumns.length === 1 ? "" : "s"}:{" "}
          {preview.missingColumns.join(", ")}. It needs an event, an athlete and a value.
        </Banner>
      ) : null}

      {preview.fileErrors.map((error) => (
        <Banner key={error} tone="error">
          {error}
        </Banner>
      ))}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PreviewCount label="New" value={counts.create} />
        <PreviewCount label="Overwrites" value={counts.update} />
        <PreviewCount label="Unchanged" value={counts.unchanged} />
        <PreviewCount label="Errors" value={counts.error} alarm />
      </div>

      {counts.error > 0 ? (
        <Banner tone="error">
          Nothing will be imported until every row is valid — a half-applied
          scoreboard is worse than a rejected file.
        </Banner>
      ) : null}

      {preview.newAthletes.length > 0 ? (
        <p className="text-sm text-muted">
          Joining the roster:{" "}
          <span className="text-paper">{preview.newAthletes.join(", ")}</span>
        </p>
      ) : null}

      <div className="card max-h-96 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Rows found in the uploaded file</caption>
          <thead className="sticky top-0 bg-[var(--raise)]">
            <tr className="border-b border-[var(--edge)]">
              <th scope="col" className="eyebrow px-3 py-2">Line</th>
              <th scope="col" className="eyebrow px-3 py-2">Athlete</th>
              <th scope="col" className="eyebrow px-3 py-2">Event</th>
              <th scope="col" className="eyebrow px-3 py-2 text-right">Mark</th>
              <th scope="col" className="eyebrow px-3 py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <PreviewRowView key={row.line} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewCount({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="card px-3 py-2">
      <p className="eyebrow">{label}</p>
      <p
        className={[
          "tnum font-display text-xl font-bold",
          alarm && value > 0 ? "text-accent" : "text-paper",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function PreviewRowView({ row }: { row: PreviewRow }) {
  const isError = row.action === "error";

  return (
    <tr className="border-b border-[var(--edge)] last:border-0">
      <td className="tnum px-3 py-2 align-top text-muted">{row.line}</td>
      <td className="px-3 py-2 align-top text-paper">{row.athleteName || "—"}</td>
      <td className="px-3 py-2 align-top">
        <span className="text-paper">{row.eventName ?? row.eventSlug ?? "—"}</span>
        {isError ? (
          <span className="mt-0.5 block text-xs text-accent">{row.error}</span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted">
            {row.action === "create"
              ? row.createsAthlete
                ? "New score · adds athlete"
                : "New score"
              : row.action === "update"
                ? `Replaces ${formatMeasurement(row.previousRawValue ?? 0, row.decimals ?? 2)} (${row.previousPoints} pts)`
                : "Already recorded"}
          </span>
        )}
      </td>
      <td className="tnum px-3 py-2 text-right align-top text-paper">
        {row.rawValue !== undefined
          ? `${formatMeasurement(row.rawValue, row.decimals ?? 2)}${row.unitLabel ? ` ${row.unitLabel}` : ""}`
          : "—"}
      </td>
      <td className="tnum px-3 py-2 text-right align-top">
        <span className={row.action === "unchanged" ? "text-muted" : "font-semibold text-accent"}>
          {row.points ?? "—"}
        </span>
      </td>
    </tr>
  );
}
