import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { siteSettings } from "./schema";
import { isMigrationPending } from "./walkout";

/**
 * Switches the admin flips from the Admin page. Each one is a row in app.site_settings.
 * Missing means off, so a deploy that lands before its migration leaves the site open.
 */

const REGISTRATION_LOCKED = "registration_locked";

export const REGISTRATION_LOCKED_MESSAGE = "Registration is closed. Ask the admin if you need an account.";

/** Whether new sign-ups are being refused. Existing accounts are unaffected. */
export async function registrationLocked(): Promise<boolean> {
  try {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, REGISTRATION_LOCKED)).limit(1);
    return row?.value === "true";
  } catch (error) {
    if (isMigrationPending(error)) return false;
    throw error;
  }
}

export async function setRegistrationLockedValue(locked: boolean): Promise<void> {
  const value = String(locked);
  await db
    .insert(siteSettings)
    .values({ key: REGISTRATION_LOCKED, value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
}
