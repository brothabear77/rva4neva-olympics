"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ResolvedMedia } from "@/lib/profiles";

const FRAME = "relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--raise)]";

/**
 * A demonstration: a photo, an animated GIF, a video, or a YouTube clip.
 *
 * Everything sits in a fixed 16:9 frame, so flipping between events does not make
 * the page jump when one has a demo and the next does not.
 *
 * A photo, GIF or video that will not load (a typo in the file name, say) falls
 * back to a plain "couldn't be loaded" panel rather than a broken-image icon or a
 * dead player. These are server-rendered, so they can fail before React attaches
 * an error handler; the effect below checks for that.
 *
 * YouTube is a facade. The player is not put on the page until someone presses
 * play, so nothing is requested from YouTube (and no tracking loads) just from
 * looking at the guide, and eleven events do not mean eleven players loading at once.
 */
export function EventMedia({ media }: { media: ResolvedMedia | null }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const video = videoRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
    if (video && video.error) setFailed(true);
  }, []);

  if (!media || failed) {
    return (
      <div className={`${FRAME} flex items-center justify-center`}>
        <p className="px-6 text-center text-sm text-muted">
          {media ? "This demo couldn\u2019t be loaded." : "Demo coming soon."}
        </p>
      </div>
    );
  }

  return (
    <figure>
      <div className={FRAME}>
        {media.kind === "image" ? (
          <Image
            ref={imgRef}
            src={media.src}
            alt={media.label}
            fill
            sizes="(min-width: 1024px) 560px, 100vw"
            onError={() => setFailed(true)}
            className="object-contain"
          />
        ) : media.kind === "gif" ? (
          // A plain <img>: Next's image optimiser would flatten the animation to one frame.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={media.src}
            alt={media.label}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : media.kind === "video" ? (
          <video
            ref={videoRef}
            onError={() => setFailed(true)}
            src={media.src}
            poster={media.poster}
            aria-label={media.label}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full bg-black"
          >
            Your browser can&apos;t play this video.
          </video>
        ) : playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.id}?autoplay=1&rel=0`}
            title={media.label}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${media.label}`}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3"
          >
            {media.poster ? (
              <Image src={media.poster} alt="" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover opacity-60" />
            ) : null}
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-ink transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path d="M8 5.6v12.8a.6.6 0 0 0 .9.5l10.4-6.4a.6.6 0 0 0 0-1L8.9 5.1a.6.6 0 0 0-.9.5z" fill="currentColor" />
              </svg>
            </span>
            <span className="relative text-xs text-muted">Loads from YouTube when you press play</span>
          </button>
        )}
      </div>
      {media.caption ? <figcaption className="mt-2 text-sm text-muted">{media.caption}</figcaption> : null}
    </figure>
  );
}
