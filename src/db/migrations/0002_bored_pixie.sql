CREATE TABLE "timeline_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"post_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_items_user_post_idx" ON "timeline_items" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "timeline_items_user_created_idx" ON "timeline_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "timeline_items_post_idx" ON "timeline_items" USING btree ("post_id");--> statement-breakpoint
INSERT INTO "timeline_items" ("id", "user_id", "post_id", "reason", "created_at")
SELECT
	'timeline_' || md5(author."user_id" || ':' || posts."id" || ':author'),
	author."user_id",
	posts."id",
	'author',
	posts."published_at"
FROM "posts" posts
INNER JOIN "actors" author ON author."id" = posts."author_actor_id"
WHERE author."user_id" IS NOT NULL
	AND author."blocked_at" IS NULL
	AND posts."deleted_at" IS NULL
	AND posts."hidden_at" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "domain_blocks" blocks WHERE lower(blocks."domain") = lower(author."domain")
	)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "timeline_items" ("id", "user_id", "post_id", "reason", "created_at")
SELECT
	'timeline_' || md5(follower."user_id" || ':' || posts."id" || ':follow'),
	follower."user_id",
	posts."id",
	'follow',
	posts."published_at"
FROM "posts" posts
INNER JOIN "actors" author ON author."id" = posts."author_actor_id"
INNER JOIN "follows" follows ON follows."followee_actor_id" = author."id"
INNER JOIN "actors" follower ON follower."id" = follows."follower_actor_id"
WHERE follower."user_id" IS NOT NULL
	AND follows."state" = 'accepted'
	AND posts."visibility" IN ('public', 'unlisted', 'followers')
	AND author."blocked_at" IS NULL
	AND posts."deleted_at" IS NULL
	AND posts."hidden_at" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "domain_blocks" blocks WHERE lower(blocks."domain") = lower(author."domain")
	)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "timeline_items" ("id", "user_id", "post_id", "reason", "created_at")
SELECT
	'timeline_' || md5(recipient."user_id" || ':' || posts."id" || ':recipient'),
	recipient."user_id",
	posts."id",
	'recipient',
	posts."published_at"
FROM "posts" posts
INNER JOIN "actors" author ON author."id" = posts."author_actor_id"
INNER JOIN "post_recipients" recipients ON recipients."post_id" = posts."id"
INNER JOIN "actors" recipient ON recipient."id" = recipients."actor_id"
WHERE recipient."user_id" IS NOT NULL
	AND posts."visibility" = 'direct'
	AND author."blocked_at" IS NULL
	AND posts."deleted_at" IS NULL
	AND posts."hidden_at" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "domain_blocks" blocks WHERE lower(blocks."domain") = lower(author."domain")
	)
ON CONFLICT DO NOTHING;
