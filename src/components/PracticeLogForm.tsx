"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logAttempt } from "@/lib/athleteActions";
import { Banner } from "./ui";

export interface PracticeEventOption {
  id: string;
  name: string;
  unitLabel: string;
  decimals: number;
}

/** Logs one attempt. The server checks the account, the event and the date again. */
export function PracticeLogForm({ events, today }: { events: PracticeEventOption[]; today: string }) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const event = events.find((e) => e.id === eventId);
  const number = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(number) && date !== "";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      setMessage(null);
      const result = await logAttempt({ eventId, value: number, attemptedOn: date, notes });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) {
        setValue("");
        setNotes("");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={save} className="card space-y-4 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="attemptEvent">
            Event
          </label>
          <select id="attemptEvent" value={eventId} onChange={(e) => setEventId(e.target.value)} className="field">
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="attemptValue">
            Result{event?.unitLabel ? ` (${event.unitLabel})` : ""}
          </label>
          <input
            id="attemptValue"
            type="number"
            inputMode="decimal"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="attemptDate">
            Date
          </label>
          <input
            id="attemptDate"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="attemptNotes">
          Notes <span className="text-muted">(optional)</span>
        </label>
        <input
          id="attemptNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={300}
          placeholder="Conditions, how it felt…"
          className="field"
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={saving || !valid || !eventId} className="btn">
        {saving ? "Saving…" : "Log attempt"}
      </button>
    </form>
  );
}
