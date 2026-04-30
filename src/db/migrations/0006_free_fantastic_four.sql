ALTER TABLE "profiles" ADD COLUMN "default_zost_visibility" "visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_discoverable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "manually_approves_followers" boolean DEFAULT false NOT NULL;