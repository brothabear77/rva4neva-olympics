"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { embedHeight, type WalkoutSong } from "@/lib/walkout";
const zIndex = -10

/**
 * The champion's walkout song, played on demand and looping once started. It does
 * not autoplay: the visitor presses Play. Spotify's plain
 * `<iframe src=...>` embed (WalkoutSong.tsx's own player) can't loop itself, so
 * this talks to Spotify's IFrame Controller API instead
 * (developer.spotify.com/documentation/embeds/references/iframe-api), which hands
 * back a JS object with play/pause/seek rather than just a URL.
 *
 * Looping: the API has no loop flag — confirmed against the actual shipped
 * bundle, not just its docs — so this rolls its own. `playback_update` reports
 * position and isPaused on every tick; a natural end is the one case where
 * playback stops with position back at 0 (a manual pause leaves position
 * wherever it was), so that transition is what this restarts on.
 *
 * Autoplay was tried and dropped. The controller has no volume or mute method
 * (play/pause/resume/seek/restart/togglePlay/destroy only — verified against the
 * shipped bundle), so autoplay depended on the browser's per-site policy and
 * often just sat paused. The Play button below starts it: a click is a real user
 * gesture. (Safari is stricter about gestures crossing into an iframe; there the
 * visitor may still need Spotify's own ▶ inside the player.)
 *
 * The player is laid over the bottom of `photo`; `children` (the champion's name
 * and score) go under that, and the Play/Pause button under them — so the player
 * and its button end up apart, which is why this takes the surrounding content
 * rather than rendering both side by side.
 */
export function WalkoutPlayer({
  song,
  photo,
  children,
}: {
  song: WalkoutSong;
  /** What the player is laid over (the champion's photo). */
  photo: ReactNode;
  /** Shown between the photo and the Play/Pause button (name and score). */
  children?: ReactNode;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const wasPlayingRef = useRef(false);
  const lastPositionRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let controller: SpotifyEmbedController | null = null;
    setReady(false);
    setPaused(true);

    loadSpotifyIframeApi().then((IFrameAPI) => {
      if (cancelled || !mountRef.current) return;
      IFrameAPI.createController(
        mountRef.current,
        { uri: `spotify:${song.kind}:${song.spotifyId}`, width: "100%", height: embedHeight(song.kind) },
        (created) => {
          if (cancelled) {
            created.destroy();
            return;
          }
          controller = created;
          controllerRef.current = created;

          created.addListener("ready", () => setReady(true));

          created.addListener("playback_update", ({ data }) => {
            // A natural end: it was playing, it progressed, and now it's stopped back
            // at 0. Pausing by hand leaves position where it was, and pausing before
            // it ever moved (lastPosition 0) isn't an end either.
            if (wasPlayingRef.current && data.isPaused && data.position === 0 && lastPositionRef.current > 0) {
              created.seek(0);
              created.resume();
            }
            wasPlayingRef.current = !data.isPaused;
            lastPositionRef.current = data.position;
            setPaused(data.isPaused);
          });
        },
      );
    });

    return () => {
      cancelled = true;
      controller?.destroy();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-create only when the song itself changes
  }, [song.kind, song.spotifyId]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {photo}
        {/* Overlaid along the bottom of the photo, not clipped to it: the player is
            wider than the photo, and Spotify's terms rule out cropping or covering
            the widget, so it's the photo that gets covered, never the other way.
            Positioned here, on a wrapper, because createController swaps the element
            it's given for its own iframe — classes on the mount point itself vanish. */}
        <div
          className="absolute bottom-2 left-1/2 w-[300px] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-xl shadow-lg shadow-black/50"
          style={{ zIndex }}
        >
          <div ref={mountRef} aria-busy={!ready} />
        </div>
      </div>
      {children}
      <button
        type="button"
        onClick={() => controllerRef.current?.togglePlay()}
        disabled={!ready}
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40",
          paused ? "border-accent bg-accent text-ink" : "border-[var(--edge-strong)] text-muted hover:text-paper",
        ].join(" ")}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
          {paused ? (
            <path d="M8 5.6v12.8a.6.6 0 0 0 .9.5l10.4-6.4a.6.6 0 0 0 0-1L8.9 5.1a.6.6 0 0 0-.9.5z" fill="currentColor" />
          ) : (
            <>
              <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

// --- Spotify's IFrame Controller API -----------------------------------------
//
// Undocumented as an npm package — this is a minimal shape covering only what's
// actually used above, checked against the real bundle at
// embed-cdn.spotifycdn.com, not just the (incomplete) public docs page.

interface SpotifyEmbedController {
  resume: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener(event: "ready", callback: () => void): void;
  addListener(
    event: "playback_update",
    callback: (e: { data: { isPaused: boolean; position: number; duration: number } }) => void,
  ): void;
}

interface SpotifyIFrameApi {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (IFrameAPI: SpotifyIFrameApi) => void;
  }
}

const IFRAME_API_SRC = "https://open.spotify.com/embed/iframe-api/v1";

// One script, one API instance, however many players ask for it across the
// page's lifetime (Fast Refresh in dev included).
let spotifyIframeApi: Promise<SpotifyIFrameApi> | null = null;

function loadSpotifyIframeApi(): Promise<SpotifyIFrameApi> {
  if (!spotifyIframeApi) {
    spotifyIframeApi = new Promise((resolve) => {
      window.onSpotifyIframeApiReady = resolve;
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      document.body.appendChild(script);
    });
  }
  return spotifyIframeApi;
}
