"use client";

import { useActionState, useState } from "react";
import { updateEventBenchmarks } from "@/lib/actions";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";
import { formatMeasurement, scoreResult } from "@/lib/scoring";
import type { ActionResult } from "@/lib/actions";
import type { Event } from "@/lib/schema";

/**
 * Retune an event's scoring scale.
 *
 * Changing a benchmark rescores every result already recorded for the event, so
 * the preview below shows what the current leader's score becomes before
 * anything is saved — moving a benchmark mid-competition should never be a
 * surprise.
 */
export function BenchmarkForm({
  event,
  sampleRaw,
  resultCount,
}: {
  event: Event;
  sampleRaw: number | null;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useScorekeeperName();
  const [top, setTop] = useState(String(event.benchmarkStandard));
  const [zero, setZero] = useState(String(event.benchmarkZero));

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => updateEventBenchmarks(formData),
    null,
  );

  const draft = { benchmarkStandard: Number(top), benchmarkZero: Number(zero) };
  const identical = draft.benchmarkStandard === draft.benchmarkZero;
  const preview =
    sampleRaw !== null &&
    !identical &&
    Number.isFinite(draft.benchmarkStandard) &&
    Number.isFinite(draft.benchmarkZero)
      ? scoreResult(sampleRaw, draft)
      : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        Adjust scoring scale
      </button>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <input type="hidden" name="eventId" value={event.id} />

      <div>
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-paper">
          Scoring scale
        </h3>
        <p className="mt-1 text-sm text-muted">
          Two anchors define the whole event. For a timed event the 100-point
          mark is the <em>faster</em> number.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="benchmarkStandard">
            Worth 100 points
          </label>
          <input
            id="benchmarkStandard"
            name="benchmarkStandard"
            type="number"
            step="any"
            required
            value={top}
            onChange={(e) => setTop(e.target.value)}
            className="field tnum"
          />
        </div>
        <div>
          <label className="label" htmlFor="benchmarkZero">
            Worth 0 points
          </label>
          <input
            id="benchmarkZero"
            name="benchmarkZero"
            type="number"
            step="any"
            required
            value={zero}
            onChange={(e) => setZero(e.target.value)}
            className="field tnum"
          />
        </div>
        <div>
          <label className="label" htmlFor="decimals">
            Decimal places
          </label>
          <input
            id="decimals"
            name="decimals"
            type="number"
            min={0}
            max={4}
            defaultValue={event.decimals}
            className="field tnum"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="benchmarkBy">
          Your name
        </label>
        <input
          id="benchmarkBy"
          name="submittedBy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="So the change history says who retuned this"
          className="field"
        />
      </div>

      {identical ? (
        <Banner tone="error">
          Both benchmarks are {top}. They must differ, or every performance would be
          worth 0 and 100 at the same time.
        </Banner>
      ) : preview !== null && sampleRaw !== null ? (
        <p className="tnum text-sm text-muted">
          Preview: the current best mark of{" "}
          <span className="text-paper">
            {formatMeasurement(sampleRaw, event.decimals)}
            {event.unitLabel ? ` ${event.unitLabel}` : ""}
          </span>{" "}
          would score <span className="font-semibold text-accent">{preview}</span> points.
        </p>
      ) : null}

      {resultCount > 0 ? (
        <p className="text-xs text-muted">
          Saving rescores all {resultCount} result{resultCount === 1 ? "" : "s"} for this
          event. Every change is recorded and can be rolled back.
        </p>
      ) : null}

      {state ? <Banner tone={state.ok ? "ok" : "error"}>{state.message}</Banner> : null}

      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={pending || identical}>
          {pending ? "Saving…" : "Save scale"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
