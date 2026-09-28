"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { clearWalkoutSong, searchWalkoutSongs, setWalkoutSong } from "@/lib/actions";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, embedUrl, type WalkoutSong } from "@/lib/walkout";
import { Banner } from "./ui";

const ROUND_BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40";
const LINK = "text-sm text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40";

/** How long typing has to pause before the search goes out. */
const SEARCH_DELAY_MS = 350;

type Panel = "player" | "search" | null;

/**
 * An athlete's name, with their walkout song beside it.
 *
 * A small play button appears when a song is set; it opens Spotify's own compact player
 * under the name (Spotify no longer hands out raw preview audio, so the player is theirs,
 * and mounts only when opened — a page of athletes does not load a page of players). The
 * Spotify logo beside it opens a search box for choosing or changing the song.
 *
 * `searchable` is false when the site has no Spotify credentials: the play button still
 * works, since the player loads in the visitor's browser, but there is nothing to search.
 */
export function WalkoutHeading({
  athleteId,
  name,
  walkout,
  searchable,
  children,
}: {
  athleteId: string;
  name: string;
  walkout: WalkoutSong | null;
  searchable: boolean;
  /** The name heading itself, rendered by the server. */
  children: ReactNode;
}) {
  const panelId = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WalkoutSong[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, startSaving] = useTransition();

  // Each keystroke restarts the timer, and each search takes a number: an answer that is
  // no longer the latest question is dropped instead of overwriting a newer one.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const toggle = (which: Exclude<Panel, null>) => setPanel((current) => (current === which ? null : which));

  const cancelSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    latest.current += 1;
    setSearching(false);
  };

  const closeSearch = () => {
    cancelSearch();
    setPanel(null);
    setQuery("");
    setResults([]);
    setMessage(null);
  };

  const onQueryChange = (text: string) => {
    setQuery(text);
    setMessage(null);
    cancelSearch();

    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }

    const ticket = latest.current;
    setSearching(true);
    timer.current = setTimeout(async () => {
      const answer = await searchWalkoutSongs(text);
      if (ticket !== latest.current) return;
      setSearching(false);
      setResults(answer.data ?? []);
      // "No songs found." is worth saying; "8 found." is not.
      setMessage(answer.ok && (answer.data?.length ?? 0) > 0 ? null : { tone: answer.ok ? "ok" : "error", text: answer.message });
    }, SEARCH_DELAY_MS);
  };

  const pick = (song: WalkoutSong) =>
    startSaving(async () => {
      const result = await setWalkoutSong({ athleteId, trackId: song.trackId });
      if (result.ok) closeSearch();
      else setMessage({ tone: "error", text: result.message });
    });

  const remove = () =>
    startSaving(async () => {
      const result = await clearWalkoutSong({ athleteId });
      if (result.ok) closeSearch();
      else setMessage({ tone: "error", text: result.message });
    });

  const searchOpen = panel === "search" && searchable;
  const playerOpen = panel === "player" && walkout !== null;

  return (
    <>
      <div className="flex items-center gap-2">
        {children}

        {walkout ? (
          <button
            type="button"
            onClick={() => toggle("player")}
            aria-expanded={playerOpen}
            aria-controls={`${panelId}-player`}
            aria-label={`Play ${name}'s walkout song: ${walkout.title} by ${walkout.artists}`}
            title={`${walkout.title} — ${walkout.artists}`}
            className={[
              ROUND_BUTTON,
              playerOpen
                ? "border-accent bg-accent text-ink"
                : "border-[var(--edge-strong)] text-accent hover:border-accent",
            ].join(" ")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 translate-x-px fill-current">
              <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5Z" />
            </svg>
          </button>
        ) : null}

        {searchable ? (
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : (setPanel("search"), setMessage(null)))}
            aria-expanded={searchOpen}
            aria-controls={`${panelId}-search`}
            aria-label={walkout ? `Change ${name}'s walkout song` : `Choose a walkout song for ${name}`}
            title={walkout ? "Change walkout song" : "Choose a walkout song"}
            className={[
              ROUND_BUTTON,
              searchOpen ? "border-[var(--edge-strong)]" : "border-transparent hover:border-[var(--edge-strong)]",
            ].join(" ")}
          >
            {/* A plain <img>: it is a fixed logo file in public/, not a photo next/image should resize. */}
            <img
              src="/spotify-logo.svg"
              alt=""
              width={20}
              height={20}
              className={["h-5 w-5 transition-opacity", searchOpen ? "opacity-100" : "opacity-60 hover:opacity-100"].join(" ")}
            />
          </button>
        ) : null}
      </div>

      {playerOpen && walkout ? (
        <div id={`${panelId}-player`} className="mt-3">
          <iframe
            key={walkout.trackId}
            src={embedUrl(walkout.trackId)}
            title={`${walkout.title} by ${walkout.artists}, on Spotify`}
            width="100%"
            height="80"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block max-w-xl rounded-xl border-0"
          />
        </div>
      ) : null}

      {searchOpen ? (
        <div
          id={`${panelId}-search`}
          className="mt-3 max-w-xl space-y-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeSearch();
          }}
        >
          <label className="sr-only" htmlFor={`${panelId}-query`}>
            Search Spotify for {name}&apos;s walkout song
          </label>
          <input
            id={`${panelId}-query`}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            maxLength={MAX_QUERY_LENGTH}
            autoFocus
            autoComplete="off"
            placeholder="Search Spotify, or paste a track link"
            className="field"
          />

          {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

          {results.length > 0 ? (
            <ul className="divide-y divide-[var(--edge)] overflow-hidden rounded-lg border border-[var(--edge)]">
              {results.map((song) => (
                <li key={song.trackId}>
                  <button
                    type="button"
                    onClick={() => pick(song)}
                    disabled={saving}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface/40 disabled:opacity-40"
                  >
                    {song.albumArtUrl ? (
                      // A plain <img>: the visitor's browser fetches it from Spotify's CDN directly, so
                      // it never passes through the server or its NAT instance.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={song.albumArtUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded bg-surface" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-paper">{song.title}</span>
                      <span className="block truncate text-xs text-muted">{song.artists}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searching ? (
            <p className="text-xs text-muted">Searching…</p>
          ) : null}

          <div className="flex items-center gap-4">
            {walkout ? (
              <button type="button" onClick={remove} disabled={saving} className={LINK}>
                Remove song
              </button>
            ) : null}
            <span className="text-xs text-muted">{saving ? "Saving…" : ""}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
