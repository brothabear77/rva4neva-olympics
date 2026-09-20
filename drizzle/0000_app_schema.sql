CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "app"."result_source" AS ENUM('ui', 'csv', 'restore');--> statement-breakpoint
CREATE TABLE "app"."athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."change_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid,
	"operation" text NOT NULL,
	"old_row" jsonb,
	"new_row" jsonb,
	"changed_by" text DEFAULT '' NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid,
	"restored_from_id" bigint
);
--> statement-breakpoint
CREATE TABLE "app"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit_label" text DEFAULT '' NOT NULL,
	"day" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"benchmark_1000" numeric(12, 4) NOT NULL,
	"benchmark_zero" numeric(12, 4) NOT NULL,
	"decimals" smallint DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"submitted_by" text DEFAULT '' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"raw_value" numeric(12, 4) NOT NULL,
	"points" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"submitted_by" text DEFAULT '' NOT NULL,
	"source" "app"."result_source" DEFAULT 'ui' NOT NULL,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."results" ADD CONSTRAINT "results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."results" ADD CONSTRAINT "results_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."results" ADD CONSTRAINT "results_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_name_lower_key" ON "app"."athletes" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "change_log_record_idx" ON "audit"."change_log" USING btree ("table_name","record_id","id");--> statement-breakpoint
CREATE INDEX "change_log_recent_idx" ON "audit"."change_log" USING btree ("changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "app"."events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_day_order_idx" ON "app"."events" USING btree ("day","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "results_event_athlete_key" ON "app"."results" USING btree ("event_id","athlete_id");--> statement-breakpoint
CREATE INDEX "results_event_points_idx" ON "app"."results" USING btree ("event_id","points");--> statement-breakpoint
CREATE INDEX "results_athlete_idx" ON "app"."results" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "results_recent_idx" ON "app"."results" USING btree ("created_at");