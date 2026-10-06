"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { clearWalkoutSong, searchWalkoutSongs, setWalkoutSong } from "@/lib/actions";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, describeWalkout, embedHeight, embedUrl, type WalkoutSong } from "@/lib/walkout";
import { Banner } from "./ui";

const ROUND_BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40";
const LINK = "text-sm text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40";

/** How long typing has to pause before the search goes out. */
const SEARCH_DELAY_MS = 350;

/** Spotify's own compact player. Mounted only when wanted, so a page of athletes doesn't load a page of players. */
function SpotifyEmbed({ walkout }: { walkout: WalkoutSong }) {
  return (
    <iframe
      key={`${walkout.kind}:${walkout.spotifyId}`}
      src={embedUrl(walkout)}
      title={`${describeWalkout(walkout)}, on Spotify`}
      width="100%"
      height={embedHeight(walkout.kind)}
      allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      className="block max-w-xl rounded-xl border-0"
    />
  );
}

/**
 * An athlete's name, with a play button for their walkout song beside it when they
 * have one. It opens Spotify's compact player under the name (Spotify no longer hands
 * out raw preview audio, so the player is theirs). Choosing the song happens on the
 * athlete's profile page, in WalkoutPicker.
 */
export function WalkoutHeading({
  name,
  walkout,
  children,
}: {
  name: string;
  walkout: WalkoutSong | null;
  /** The name heading itself, rendered by the server. */
  children: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const playerOpen = open && walkout !== null;

  return (
    <>
      <div className="flex items-center gap-2">
        {children}

        {walkout ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={playerOpen}
            aria-controls={`${panelId}-player`}
            aria-label={`Play ${name}'s walkout song: ${describeWalkout(walkout)}`}
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
      </div>

      {playerOpen && walkout ? (
        <div id={`${panelId}-player`} className="mt-3">
          <SpotifyEmbed walkout={walkout} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Choosing a walkout song, on the profile page: the current one with its player, a
 * search box (pasting a Spotify song or episode link sets exactly that; search itself
 * only finds songs), and a way to remove it. The server checks again that the
 * signed-in account may change this athlete's song.
 *
 * `searchable` is false when the site has no Spotify credentials: there is nothing to
 * search, but a song already chosen still plays and can still be removed.
 */
export function WalkoutPicker({
  athleteId,
  name,
  walkout,
  searchable,
}: {
  athleteId: string;
  name: string;
  walkout: WalkoutSong | null;
  searchable: boolean;
}) {
  const router = useRouter();
  const queryId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WalkoutSong[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, startSaving] = useTransition();

  // Each keystroke restarts the timer, and each search takes a number: an answer that is
  // no longer the latest question is dropped instead of overwriting a newer one.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const cancelSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    latest.current += 1;
    setSearching(false);
  };

  const resetSearch = () => {
    cancelSearch();
    setQuery("");
    setResults([]);
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

  const run = (action: () => ReturnType<typeof clearWalkoutSong>) =>
    startSaving(async () => {
      const result = await action();
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) {
        resetSearch();
        router.refresh();
      }
    });

  const pick = (song: WalkoutSong) => run(() => setWalkoutSong({ athleteId, kind: song.kind, spotifyId: song.spotifyId }));
  const remove = () => run(() => clearWalkoutSong({ athleteId }));

  return (
    <div className="max-w-xl space-y-3">
      {walkout ? (
        <SpotifyEmbed walkout={walkout} />
      ) : (
        <p className="text-sm text-muted">{name} doesn&apos;t have a walkout song yet.</p>
      )}

      {searchable ? (
        <div
          className="space-y-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") resetSearch();
          }}
        >
          <label className="label" htmlFor={queryId}>
            {walkout ? "Change song" : "Choose a song"}
          </label>
          <input
            id={queryId}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            placeholder="Search Spotify, or paste a song or episode link"
            className="field"
          />

          {results.length > 0 ? (
            <ul className="divide-y divide-[var(--edge)] overflow-hidden rounded-lg border border-[var(--edge)]">
              {results.map((song) => (
                <li key={`${song.kind}:${song.spotifyId}`}>
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
        </div>
      ) : (
        <p className="text-xs text-muted">Song search isn&apos;t set up on this site yet.</p>
      )}

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <div className="flex items-center gap-4">
        {walkout ? (
          <button type="button" onClick={remove} disabled={saving} className={LINK}>
            Remove song
          </button>
        ) : null}
        <span className="text-xs text-muted">{saving ? "Saving…" : ""}</span>
      </div>
    </div>
  );
}
