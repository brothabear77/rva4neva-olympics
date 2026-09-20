"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitResult } from "@/lib/actions";
import { Banner } from "./ui";
import { useScorekeeperName } from "./useScorekeeperName";
import { describeScale, isLowerBetter, scoreResult } from "@/lib/scoring";
import type { ActionResult } from "@/lib/actions";
import type { Athlete, Event } from "@/lib/schema";

/**
 * Post one score.
 *
 * The point value updates as you type, using the same `scoreResult` the server
 * uses to store it — so the number shown before submitting is the number that
 * lands on the leaderboard, not an approximation.
 */
export function ResultForm({
  events,
  athletes,
}: {
  events: Event[];
  athletes: Athlete[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useScorekeeperName();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [rawValue, setRawValue] = useState("");

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const result = await submitResult(formData);
      if (result.ok) setRawValue("");
      return result;
    },
    null,
  );

  // React clears the form after a successful action, which is what we want for
  // the athlete and notes — but not for the event. Scores arrive one event at a
  // time, athlete after athlete, so re-select it and put the cursor back on the
  // name. The controlled text inputs restore themselves from state on the
  // re-render; a <select> does not, so it needs setting explicitly.
  useEffect(() => {
    if (!state?.ok) return;
    const form = formRef.current;
    if (!form) return;
    form.eventId.value = eventId;
    form.athleteName.focus();
  }, [state, eventId]);

  const event = events.find((e) => e.id === eventId) ?? null;
  const parsedRaw = Number(rawValue);
  const preview =
    event && rawValue.trim() !== "" && Number.isFinite(parsedRaw)
      ? scoreResult(parsedRaw, event)
      : null;

  const days = [...new Set(events.map((e) => e.day))].sort();

  if (events.length === 0) {
    return (
      <Banner tone="error">
        There are no events to score yet. Load the schedule first.
      </Banner>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <div>
        <label className="label" htmlFor="eventId">
          Event
        </label>
        <select
          id="eventId"
          name="eventId"
          required
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="field"
        >
          {days.map((day) => (
            <optgroup key={day} label={`Day ${day}`}>
              {events
                .filter((e) => e.day === day)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {event ? (
          <p className="tnum mt-1.5 text-xs text-muted">
            {describeScale(event, event.decimals, event.unitLabel)} ·{" "}
            {isLowerBetter(event) ? "lower is better" : "higher is better"}
          </p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="athleteName">
          Athlete
        </label>
        <input
          id="athleteName"
          name="athleteName"
          list="roster"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Type a name — new names join the roster"
          className="field"
        />
        {/* A datalist rather than a select: the roster is a convenience, not a
            restriction, so somebody who shows up on day two can still be scored. */}
        <datalist id="roster">
          {athletes.map((a) => (
            <option key={a.id} value={a.name} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="label" htmlFor="rawValue">
          Result{event?.unitLabel ? ` (${event.unitLabel})` : ""}
        </label>
        <div className="flex items-stretch gap-3">
          <input
            id="rawValue"
            name="rawValue"
            type="number"
            step="any"
            required
            inputMode="decimal"
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder={event ? `e.g. ${event.benchmark1000}` : "0"}
            className="field tnum flex-1"
          />
          <div
            aria-live="polite"
            className="flex min-w-28 flex-col items-center justify-center rounded-lg border border-[var(--edge)] px-3"
          >
            <span className="tnum font-display text-xl font-bold text-accent">
              {preview ?? "—"}
            </span>
            <span className="eyebrow">points</span>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="notes"
          name="notes"
          maxLength={280}
          placeholder="Wind, do-overs, disputes"
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="submittedBy">
          Your name
        </label>
        <input
          id="submittedBy"
          name="submittedBy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Recorded in the change history"
          className="field"
        />
      </div>

      {state ? <Banner tone={state.ok ? "ok" : "error"}>{state.message}</Banner> : null}

      <button type="submit" className="btn w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : "Record result"}
      </button>

      <p className="text-xs text-muted">
        Scoring someone who already has a result for this event replaces it. The
        old value stays in the change history and can be restored.
      </p>
    </form>
  );
}
