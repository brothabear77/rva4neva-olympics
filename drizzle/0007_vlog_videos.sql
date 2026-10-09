CREATE TABLE "app"."vlog_hearts" (
	"video_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vlog_hearts_video_id_athlete_id_pk" PRIMARY KEY("video_id","athlete_id")
);
--> statement-breakpoint
CREATE TABLE "app"."vlog_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"event_id" uuid,
	"title" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."vlog_hearts" ADD CONSTRAINT "vlog_hearts_video_id_vlog_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "app"."vlog_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vlog_hearts" ADD CONSTRAINT "vlog_hearts_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vlog_videos" ADD CONSTRAINT "vlog_videos_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vlog_videos" ADD CONSTRAINT "vlog_videos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vlog_videos_object_key_key" ON "app"."vlog_videos" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "vlog_videos_feed_idx" ON "app"."vlog_videos" USING btree ("uploaded_at");