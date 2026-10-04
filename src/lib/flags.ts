import "server-only";
import { boolFlag } from "./launchdarkly";

/**
 * The site's feature flags. Each is a boolean flag in LaunchDarkly; the key here
 * has to match the key there. Every flag has a fallback, used whenever
 * LaunchDarkly is unreachable or has no SDK key, and each fallback is the
 * behavior the site should have if nobody has touched anything: an outage at
 * LaunchDarkly must never lock the scoreboard.
 */

/**
 * On means the scores are frozen: nothing can be submitted, deleted or restored from
 * the change history. Off (or unreachable) means everything is open. The key is
 * "submission-lock" because that is what it was first created for; it now covers all
 * three.
 */
export const SUBMISSION_LOCK_FLAG = "submission-lock";

export const SUBMISSIONS_LOCKED_MESSAGE = "The scoreboard is currently locked.";

/**
 * Gates the champion on the home page, on top of the scores being complete: both
 * have to hold. Falls back to on, so an outage at LaunchDarkly doesn't hide a
 * champion that is otherwise due.
 */
export const SHOW_CHAMPION_FLAG = "show-champion";

export function showChampion(): Promise<boolean> {
  return boolFlag(SHOW_CHAMPION_FLAG, true);
}

/**
 * Whether the scores are currently frozen.
 *
 * This is what stops a change, not the page: the grid, the CSV import and the
 * remove/undo/delete buttons are disabled while it is true, but anyone can post to a
 * server action directly, so each action asks this itself. Covered: submitGrid and
 * commitImport (adding scores), deleteScores and deleteAthlete (removing
 * them; deleting an athlete removes their scores too) and restoreChange (undoing a
 * change from the history).
 *
 * Deliberately not covered: adding or renaming an athlete, which touch no scores, setting
 * a walkout song, and retuning an event's scale.
 */
export function submissionsLocked(): Promise<boolean> {
  return boolFlag(SUBMISSION_LOCK_FLAG, false);
}
