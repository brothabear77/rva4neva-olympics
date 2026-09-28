"use client";

import { useMemo, useState } from "react";
import { ordinal, projectedRank } from "@/lib/calculator";
import { isPartialNumber, parseCell } from "@/lib/grid";
import { describeScale, formatMeasurement, isScorable, scoreResult } from "@/lib/scoring";
import { DayTag, Stat } from "./ui";
import type { Event } from "@/lib/schema";

export interface CalculatorAthlete {
  id: string;
  name: string;
  totalPoints: number;
  /** Stored raw measurement per event id. */
  byEvent: Record<string, number>;
}

/**
 * A what-if scoresheet. Type a raw result per event and the points, projected
 * total and projected rank update as you go. Picking an athlete prefills their
 * recorded results; everything stays editable and nothing is ever saved.
 */
export function ScoreCalculator({
  events,
  athletes,
}: {
  events: Event[];
  athletes: CalculatorAthlete[];
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [athleteId, setAthleteId] = useState("");

  const chooseAthlete = (id: string) => {
    setAthleteId(id);
    const athlete = athletes.find((a) => a.id === id);
    if (!athlete) return;
    setInputs(
      Object.fromEntries(
        events.flatMap((event) => {
          const raw = athlete.byEvent[event.id];
          return raw === undefined ? [] : [[event.id, formatMeasurement(raw, event.decimals)]];
        }),
      ),
    );
  };

  const clear = () => {
    setAthleteId("");
    setInputs({});
  };

  const rows = useMemo(
    () =>
      events.map((event) => {
        const cell = parseCell(inputs[event.id] ?? "");
        const points = cell.kind === "number" && isScorable(event) ? scoreResult(cell.value, event) : null;
        return { event, cell, points };
      }),
    [events, inputs],
  );

  const total = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
  const filled = rows.filter((r) => r.points !== null).length;

  const { rank, of } = useMemo(
    () => projectedRank(total, athletes.filter((a) => a.id !== athleteId).map((a) => a.totalPoints)),
    [total, athletes, athleteId],
  );

  const days = [...new Set(events.map((e) => e.day))].sort((a, b) => a - b);
  const anyInput = Object.values(inputs).some((v) => v !== "");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Projected total" value={total.toLocaleString()} hint="points" emphasis />
        <Stat
          label="Projected rank"
          value={filled === 0 ? "—" : ordinal(rank)}
          hint={filled === 0 ? "enter a result to see" : `of ${of} on today's board`}
        />
        <Stat label="Events filled" value={`${filled} of ${events.length}`} />
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="calc-athlete" className="label">
            Start from an athlete&apos;s results
          </label>
          <select
            id="calc-athlete"
            className="field"
            value={athleteId}
            onChange={(e) => chooseAthlete(e.target.value)}
          >
            <option value="">Just exploring</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-ghost" onClick={clear} disabled={!anyInput && !athleteId}>
          Clear
        </button>
      </div>

      {days.map((day) => (
        <section key={day} aria-label={`Day ${day}`}>
          <h2 className="eyebrow mb-3">Day {day}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows
              .filter((r) => r.event.day === day)
              .map(({ event, cell, points }) => {
                const inputId = `calc-${event.id}`;
                const invalid = cell.kind === "invalid";
                return (
                  <li key={event.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <label
                        htmlFor={inputId}
                        className="font-display text-lg font-semibold uppercase tracking-wide text-paper"
                      >
                        {event.name}
                      </label>
                      <DayTag day={event.day} order={event.sortOrder} />
                    </div>
                    <p className="tnum mt-1 text-xs text-muted">
                      {describeScale(event, event.decimals, event.unitLabel)}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          id={inputId}
                          className="field tnum"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={event.unitLabel || "result"}
                          aria-invalid={invalid}
                          value={inputs[event.id] ?? ""}
                          onChange={(e) => {
                            const text = e.target.value;
                            if (isPartialNumber(text)) setInputs((prev) => ({ ...prev, [event.id]: text }));
                          }}
                        />
                        {event.unitLabel ? <span className="text-sm text-muted">{event.unitLabel}</span> : null}
                      </div>
                      <p className="tnum w-24 shrink-0 text-right font-display text-xl font-bold text-paper">
                        {points === null ? "—" : points.toLocaleString()}
                        <span className="ml-1 text-xs font-medium text-muted">pts</span>
                      </p>
                    </div>
                    {invalid ? <p className="mt-1.5 text-xs text-muted">That isn&apos;t a valid result.</p> : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
