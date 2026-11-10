import type { NextFetchEvent, NextRequest } from "next/server";
import { wakeDatabase } from "@/lib/db";

// One ping a minute is plenty: Aurora only pauses after five idle minutes, and an
// awake database doesn't need reminding on every request. Kept per server instance.
const PING_EVERY_MS = 60_000;
let lastPing = 0;

/**
 * Every page request, including client-side clicks between pages, starts a paused
 * Aurora waking up. Pages without data (the pre-kickoff homepage, /info) would
 * otherwise let it sleep, and the next page with data would wait ~15s for it.
 * `waitUntil` means the request never waits on the ping. See "A paused database"
 * in infra/aws.md.
 */
export function proxy(_request: NextRequest, event: NextFetchEvent) {
  const now = Date.now();
  if (now - lastPing < PING_EVERY_MS) return;
  lastPing = now;
  event.waitUntil(wakeDatabase());
}

export const config = {
  // Pages only. /api is left out so App Runner's health check (/api/health, every
  // few seconds) can't keep the database awake forever, and anything with a file
  // extension is a static asset.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
