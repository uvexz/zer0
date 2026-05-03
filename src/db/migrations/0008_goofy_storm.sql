CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'site' NOT NULL,
	"site_name" text DEFAULT 'Zer0' NOT NULL,
	"site_description" text DEFAULT 'A quiet federated microblog for zosts.' NOT NULL,
	"show_local_zosts" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
