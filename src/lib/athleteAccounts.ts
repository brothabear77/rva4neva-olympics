import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * The one place an athlete and their account are created. An athlete and their account
 * are a single thing: the database refuses to commit an athlete without one
 * (drizzle/0014), and deleting the athlete deletes the account, profile and everything
 * else with them (see deleteAthlete).
 *
 * Used by sign-up, `npm run auth:athletes` and the seed, so it imports nothing
 * server-only. Callers hash the password (password.ts) and, inside the app, update
 * open proposals' close times afterwards (proposalClock.ts), since a new athlete is a
 * new voter.
 */

/** A database or a transaction: anything that can insert. */
type Writer = Pick<NodePgDatabase<typeof schema>, "insert">;

/** The starting password the scripts give an athlete: their name, lowercase, spaces removed, plus 1 ("nick1"). */
export function initialPassword(name: string): string {
  return `${name.replace(/\s+/g, "")}1`.toLowerCase();
}

/**
 * Give an athlete already on the roster their account, and an empty profile row (unless
 * they have one), so every athlete has the same three rows from the start.
 */
export async function addAccount(
  tx: Writer,
  input: { athleteId: string; username: string; passwordHash: string },
): Promise<{ accountId: string }> {
  const [account] = await tx
    .insert(schema.accounts)
    .values({ role: "athlete", athleteId: input.athleteId, username: input.username, passwordHash: input.passwordHash })
    .returning({ id: schema.accounts.id });
  await tx.insert(schema.athleteProfiles).values({ athleteId: input.athleteId }).onConflictDoNothing();
  return { accountId: account.id };
}

/**
 * Add a new athlete to the roster with their account and profile. Run it in a
 * transaction: the roster row alone can't be committed. The name and username must
 * already be checked; the unique indexes catch a race for either.
 */
export async function createAthlete(
  tx: Writer,
  input: { name: string; username: string; passwordHash: string },
): Promise<{ athleteId: string; accountId: string; name: string }> {
  const [athlete] = await tx.insert(schema.athletes).values({ name: input.name }).returning();
  const { accountId } = await addAccount(tx, { athleteId: athlete.id, username: input.username, passwordHash: input.passwordHash });
  return { athleteId: athlete.id, accountId, name: athlete.name };
}
