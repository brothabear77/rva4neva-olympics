"use client";

import { useState } from "react";
import { fuzzyMatches } from "@/lib/fuzzy";
import { VlogGrid, type VlogItem } from "./VlogGrid";

/** The Event filter's value for clips that aren't tied to an event. */
const NO_EVENT = "__none";

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * The Vlog's feed with a title search and an Athlete and an Event filter above it. All
 * three are optional and combine (a clip has to match each one that is set). The search
 * forgives typos (src/lib/fuzzy.ts). The dropdown choices are built from the clips
 * themselves, so nobody is offered a filter that can only return nothing.
 */
export function VlogFeed({ items, canHeart }: { items: VlogItem[]; canHeart: boolean }) {
  const [search, setSearch] = useState("");
  const [athlete, setAthlete] = useState("");
  const [event, setEvent] = useState("");

  const athletes = sorted(items.map((item) => item.athleteName));
  const events = sorted(items.flatMap((item) => (item.eventName ? [item.eventName] : [])));
  const hasUntied = items.some((item) => !item.eventName);

  const shown = items.filter(
    (item) =>
      fuzzyMatches(item.title, search) &&
      (!athlete || item.athleteName === athlete) &&
      (!event || (event === NO_EVENT ? !item.eventName : item.eventName === event)),
  );
  const filtering = search.trim() !== "" || athlete !== "" || event !== "";

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="vlogSearch">
            Search titles
          </label>
          <input
            id="vlogSearch"
            type="search"
            className="field"
            placeholder="Search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="vlogFilterAthlete">
            Athlete
          </label>
          <select id="vlogFilterAthlete" className="field" value={athlete} onChange={(e) => setAthlete(e.target.value)}>
            <option value="">All athletes</option>
            {athletes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vlogFilterEvent">
            Event
          </label>
          <select id="vlogFilterEvent" className="field" value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">All events</option>
            {events.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {hasUntied && <option value={NO_EVENT}>Not tied to an event</option>}
          </select>
        </div>
        {filtering && (
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:text-paper"
            onClick={() => {
              setSearch("");
              setAthlete("");
              setEvent("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {filtering && (
        <p className="mb-4 text-sm text-muted" role="status">
          {shown.length === 1 ? "1 video" : `${shown.length} videos`}
        </p>
      )}

      {shown.length > 0 ? (
        <VlogGrid key={`${search}|${athlete}|${event}`} items={shown} canHeart={canHeart} />
      ) : (
        <p className="card px-6 py-10 text-center text-sm text-muted">No videos match those filters.</p>
      )}
    </>
  );
}
