"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/profiles";

/**
 * An athlete's photo, or their initials when there is none, or when the photo
 * cannot be loaded.
 *
 * The outer box is a fixed square, same as the initials fallback, so every
 * row's name and bio start at the same x position. The photo itself is never
 * cropped or stretched to fill it, though: object-contain scales it down to
 * fit inside the square in whichever direction it needs to, leaving the box's
 * own background as letterboxing on the other two sides — a portrait phone
 * photo ends up narrower, a wide landscape one ends up shorter, and a plain
 * width/height (with no object-fit) would instead squash either into the
 * square and visibly distort it. A plain <img>, not next/image — next/image's
 * `fill` mode needs the image itself to fill a fixed aspect ratio, which is
 * exactly the crop this avoids.
 *
 * The no-photo/failed-to-load case is the point of this being a component. A
 * typo in a photo path in src/content/athletes.ts would otherwise put a
 * broken-image box on the public page. The image is server-rendered, so it can
 * fail before React has attached its error handler, and `onError` alone would
 * never hear about it; the effect checks for an image that has already failed
 * to load.
 */
const BOX_SIZE = {
  md: "h-24 w-24 sm:h-32 sm:w-32",
  lg: "h-28 w-28 sm:h-40 sm:w-40 lg:h-48 lg:w-48",
} as const;
const INITIALS_TEXT_SIZE = {
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl lg:text-6xl",
} as const;

export function AthletePhoto({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string;
  /** "lg" for a spot with room to spare, like the homepage champion. */
  size?: keyof typeof BOX_SIZE;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  const showPhoto = Boolean(src) && !failed;

  if (showPhoto && src) {
    return (
      <div className={`${BOX_SIZE[size]} shrink-0 overflow-hidden rounded-lg bg-surface`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex ${BOX_SIZE[size]} shrink-0 items-center justify-center rounded-lg bg-surface font-display font-bold text-muted ${INITIALS_TEXT_SIZE[size]}`}
    >
      {initials(name)}
    </span>
  );
}
