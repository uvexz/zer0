CREATE TYPE "public"."activity_direction" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE IF NOT EXISTS 'dead';--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"direction" "activity_direction" NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"object_uri" text,
	"target_uri" text,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activities_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "actor_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"key_id" text NOT NULL,
	"algorithm" text DEFAULT 'RSASSA-PKCS1-v1_5' NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_jwk" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "actor_keys_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_keys" ADD CONSTRAINT "actor_keys_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_actor_idx" ON "activities" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activities_object_uri_idx" ON "activities" USING btree ("object_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "actor_keys_actor_id_idx" ON "actor_keys" USING btree ("actor_id");
