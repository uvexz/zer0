import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  actors,
  mediaAssets,
  postMedia,
  posts,
  profiles,
} from "@/db/schema";

export type ZostListItem = Awaited<ReturnType<typeof mapPostRows>>[number];

export async function getHomeTimeline(userId: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        or(
          eq(posts.visibility, "public"),
          eq(posts.visibility, "unlisted"),
          eq(actors.userId, userId),
        ),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(rows, userId);
}

export async function getProfilePosts(username: string, viewerUserId?: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(profiles.username, username),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        viewerUserId
          ? or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted"), eq(actors.userId, viewerUserId))
          : or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(rows, viewerUserId);
}

export async function getZostThread(postId: string, viewerUserId?: string) {
  const [target] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!target) return [];

  const ids = [postId, target.replyToPostId].filter(Boolean) as string[];
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        isNull(posts.deletedAt),
        or(inArray(posts.id, ids), eq(posts.replyToPostId, postId)),
      ),
    )
    .orderBy(posts.publishedAt);

  return mapPostRows(rows, viewerUserId);
}

async function mapPostRows(
  rows: Array<{
    post: typeof posts.$inferSelect;
    actor: typeof actors.$inferSelect;
    profile: typeof profiles.$inferSelect;
  }>,
  viewerUserId?: string,
) {
  const postIds = rows.map((row) => row.post.id);
  const mediaRows = postIds.length
    ? await db
        .select({ postId: postMedia.postId, media: mediaAssets })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
        .where(inArray(postMedia.postId, postIds))
        .orderBy(postMedia.position)
    : [];

  return rows.map((row) => ({
    ...row,
    media: mediaRows
      .filter((mediaRow) => mediaRow.postId === row.post.id)
      .map((mediaRow) => mediaRow.media),
    canDelete: row.actor.userId === viewerUserId,
  }));
}
