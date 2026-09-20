"use client";

import { useEffect, useState } from "react";

const KEY = "rva4neva.scorekeeper";

/**
 * Remembers who is keeping score on this device.
 *
 * There are no accounts, so attribution depends entirely on people typing their
 * name — which they will stop doing by the third event if we ask every time.
 * Stored per browser, read only for prefilling; the value is always re-sent
 * with the form rather than trusted server-side.
 */
export function useScorekeeperName(): [string, (next: string) => void] {
  const [name, setName] = useState("");

  // Read after mount: localStorage does not exist during the server render, and
  // reading it in the initial state would mismatch the prerendered HTML.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored) setName(stored);
    } catch {
      // Private browsing or blocked site data — prefilling is a convenience.
    }
  }, []);

  const update = (next: string) => {
    setName(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Ignore: the value still rides along with the form.
    }
  };

  return [name, update];
}
