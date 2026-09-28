import "server-only";
import { boolFlag } from "./launchdarkly";

/**
 * The site's feature flags. Each is a boolean flag in LaunchDarkly; the key here
 * has to match the key there. Every flag has a fallback, used whenever
 * LaunchDarkly is unreachable or has no SDK key, and each fallback is the
 * behavior the site should have if nobody has touched anything: an outage at
 * LaunchDarkly must never lock the scoreboard.
 */

/** On means new scores cannot be submitted. Off (or unreachable) means submissions are open. */
export const SUBMISSION_LOCK_FLAG = "submission-lock";

export const SUBMISSIONS_LOCKED_MESSAGE =
  "Score submissions are paused right now, so nothing was saved. Check back soon.";

/**
 * Whether new scores are currently blocked.
 *
 * This is what stops a submission, not the page: the grid and the CSV upload are
 * disabled while it is true, but anyone can post to a server action directly, so
 * submitGrid and commitImport ask this themselves. Corrections (deleting a score,
 * rolling a change back, retuning a scale) and roster edits are deliberately not
 * covered, so a mistake can still be fixed while submissions are paused.
 */
export function submissionsLocked(): Promise<boolean> {
  return boolFlag(SUBMISSION_LOCK_FLAG, false);
}
