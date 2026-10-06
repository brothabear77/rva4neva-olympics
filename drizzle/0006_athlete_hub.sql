CREATE TABLE "app"."practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"raw_value" numeric(12, 4) NOT NULL,
	"attempted_on" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."proposal_votes" (
	"proposal_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"in_favor" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_votes_proposal_id_athlete_id_pk" PRIMARY KEY("proposal_id","athlete_id")
);
--> statement-breakpoint
CREATE TABLE "app"."proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."practice_attempts" ADD CONSTRAINT "practice_attempts_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."practice_attempts" ADD CONSTRAINT "practice_attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."proposal_votes" ADD CONSTRAINT "proposal_votes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "app"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."proposal_votes" ADD CONSTRAINT "proposal_votes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."proposals" ADD CONSTRAINT "proposals_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_attempts_athlete_event_idx" ON "app"."practice_attempts" USING btree ("athlete_id","event_id","attempted_on");--> statement-breakpoint
CREATE INDEX "proposals_closes_idx" ON "app"."proposals" USING btree ("closes_at");