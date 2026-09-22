"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/profiles";

/**
 * An athlete's photo, or their initials when there is none, or when the photo
 * cannot be loaded.
 *
 * That last case is the point of this being a component. A typo in a photo path
 * in src/content/athletes.ts would otherwise put a broken-image box on the public
 * page. The image is server-rendered, so it can fail before React has attached
 * its error handler, and `onError` alone would never hear about it; the effect
 * checks for an image that has already failed to load.
 */
export function AthletePhoto({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  const showPhoto = Boolean(src) && !failed;

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface sm:h-32 sm:w-32">
      {showPhoto && src ? (
        /^https?:\/\//i.test(src) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt={name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            ref={imgRef}
            src={src}
            alt={name}
            fill
            sizes="(min-width: 640px) 128px, 96px"
            onError={() => setFailed(true)}
            className="object-cover"
          />
        )
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center font-display text-3xl font-bold text-muted sm:text-4xl"
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
