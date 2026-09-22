"use client";

import { useState } from "react";
import { CsvUpload } from "./CsvUpload";
import { ScoreGrid, type StoredResult } from "./ScoreGrid";
import type { Athlete, Event } from "@/lib/schema";

type Mode = "grid" | "csv";

/**
 * The two ways in: fill in the scoresheet by hand, or upload a whole file when
 * somebody has been keeping tally on paper.
 */
export function SubmitPanels({
  events,
  athletes,
  results,
}: {
  events: Event[];
  athletes: Athlete[];
  results: StoredResult[];
}) {
  const [mode, setMode] = useState<Mode>("grid");

  const tab = (value: Mode, label: string, hint: string) => {
    const active = mode === value;
    return (
      <button
        key={value}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setMode(value)}
        className={[
          "flex-1 rounded-lg border px-4 py-3 text-left transition-colors",
          active
            ? "border-accent bg-accent/10"
            : "border-[var(--edge)] hover:border-[var(--edge-strong)]",
        ].join(" ")}
      >
        <span
          className={[
            "block font-display text-sm font-semibold uppercase tracking-wide",
            active ? "text-accent" : "text-paper",
          ].join(" ")}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </button>
    );
  };

  return (
    <>
      <div role="tablist" aria-label="How to submit" className="mb-6 flex flex-col gap-2 sm:flex-row">
        {tab("grid", "Score grid", "Fill in the scoresheet")}
        {tab("csv", "CSV upload", "Import a whole file")}
      </div>

      <div className="card p-4 sm:p-6">
        {/* Both stay mounted and one is hidden, so flipping to the CSV tab and back
            does not throw away a half-filled grid. */}
        <div hidden={mode !== "grid"}>
          <ScoreGrid events={events} athletes={athletes} results={results} />
        </div>
        <div hidden={mode !== "csv"}>
          <CsvUpload />
        </div>
      </div>
    </>
  );
}
