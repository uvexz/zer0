CREATE TYPE "public"."media_processing_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"type" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processing_status" "media_processing_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
UPDATE "media_assets"
SET "processing_status" = 'processed',
	"processed_at" = "created_at"
WHERE "remote_url" IS NOT NULL OR "width" IS NOT NULL OR "height" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_variants_media_type_idx" ON "media_variants" USING btree ("media_id","type");--> statement-breakpoint
CREATE INDEX "media_variants_media_idx" ON "media_variants" USING btree ("media_id");
