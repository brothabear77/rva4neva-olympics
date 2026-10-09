"use client";

import { useState, type ComponentProps } from "react";

/**
 * A password field with a button inside it that shows or hides what was typed. It starts
 * hidden every time the page loads, so a shown password is never left that way by accident.
 * Takes the props of an <input>, except `type`, which the toggle controls.
 */
export function PasswordInput({ className = "", ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={className ? `field pr-12 ${className}` : "field pr-12"} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted hover:text-paper"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
