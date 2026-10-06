CREATE TYPE "app"."account_role" AS ENUM('athlete', 'scorekeeper', 'admin');--> statement-breakpoint
CREATE TABLE "app"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "app"."account_role" DEFAULT 'athlete' NOT NULL,
	"athlete_id" uuid,
	"staff_name" text,
	"password_hash" text NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_one_owner" CHECK (("app"."accounts"."athlete_id" is null) <> ("app"."accounts"."staff_name" is null))
);
--> statement-breakpoint
CREATE TABLE "app"."athlete_profiles" (
	"athlete_id" uuid PRIMARY KEY NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"photo" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."claim_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."accounts" ADD CONSTRAINT "accounts_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."athlete_profiles" ADD CONSTRAINT "athlete_profiles_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."claim_requests" ADD CONSTRAINT "claim_requests_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_athlete_key" ON "app"."accounts" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_staff_name_lower_key" ON "app"."accounts" USING btree (lower("staff_name"));--> statement-breakpoint
CREATE INDEX "claim_requests_athlete_idx" ON "app"."claim_requests" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "app"."sessions" USING btree ("account_id");