-- Accounts get a username to sign in with, separate from the name shown on the site.
-- Existing accounts start with their name, lowercased with anything but letters and
-- digits removed ("Nick" -> "nick", "Head Judge" -> "headjudge"). Added nullable,
-- filled in, then made required, since the table already has rows.
ALTER TABLE "app"."accounts" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "app"."accounts" AS acc
SET "username" = lower(regexp_replace(COALESCE(acc."staff_name", ath."name"), '[^A-Za-z0-9]', '', 'g'))
FROM (SELECT acc2."id", a."name" FROM "app"."accounts" acc2 LEFT JOIN "app"."athletes" a ON a."id" = acc2."athlete_id") AS ath
WHERE ath."id" = acc."id";--> statement-breakpoint
ALTER TABLE "app"."accounts" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_lower_key" ON "app"."accounts" USING btree (lower("username"));
