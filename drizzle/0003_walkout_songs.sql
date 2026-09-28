CREATE TABLE "app"."walkout_songs" (
	"athlete_id" uuid PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"title" text NOT NULL,
	"artists" text NOT NULL,
	"album_art_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."walkout_songs" ADD CONSTRAINT "walkout_songs_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "app"."athletes"("id") ON DELETE cascade ON UPDATE no action;