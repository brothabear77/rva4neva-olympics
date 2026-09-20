"use client";

import { useState } from "react";
import { CsvUpload } from "./CsvUpload";
import { ResultForm } from "./ResultForm";
import type { Athlete, Event } from "@/lib/schema";

type Mode = "form" | "csv";

/**
 * The two ways in: one score at a time from the sideline, or a whole file at
 * once when somebody has been keeping tally on paper.
 */
export function SubmitPanels({ events, athletes }: { events: Event[]; athletes: Athlete[] }) {
  const [mode, setMode] = useState<Mode>("form");

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
        {tab("form", "One result", "Type a single score")}
        {tab("csv", "CSV upload", "Import a whole file")}
      </div>

      <div className="card p-4 sm:p-6">
        {mode === "form" ? <ResultForm events={events} athletes={athletes} /> : <CsvUpload />}
      </div>
    </>
  );
}
