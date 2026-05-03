import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  actors,
  announces,
  bookmarks,
  likes,
  mediaAssets,
  postMedia,
  postTags,
  posts,
  profiles,
  timelineItems,
} from "@/db/schema";
import { actorProfileHref } from "@/features/accounts/queries";
import { cacheTags } from "@/lib/cache-tags";
import { cachedRead } from "@/lib/cached-read";
import { canViewPost } from "./visibility";

export type ZostListItem = Awaited<ReturnType<typeof mapPostRows>>[number];

export async function getHomeTimeline(userId: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(timelineItems)
    .innerJoin(posts, eq(posts.id, timelineItems.postId))
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(timelineItems.userId, userId),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        isNull(actors.blockedAt),
        or(isNull(profiles.userId), isNull(profiles.disabledAt)),
      ),
    )
    .orderBy(desc(timelineItems.createdAt), desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(await visibleRows(rows, userId), userId);
}

export async function getLocalTimeline(viewerUserId?: string, limit = 50) {
  if (!viewerUserId) {
    return cachedRead({
      key: `local-timeline:${limit}`,
      tags: [cacheTags.localTimeline],
      load: () => readLocalTimeline(undefined, limit),
    });
  }

  return readLocalTimeline(viewerUserId, limit);
}

async function readLocalTimeline(viewerUserId?: string, limit = 50) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(actors.type, "local"),
        eq(posts.visibility, "public"),
        isNull(profiles.disabledAt),
        isNull(actors.blockedAt),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit);

  return mapPostRows(rows, viewerUserId);
}

export async function getProfilePosts(username: string, viewerUserId?: string) {
  if (!viewerUserId) {
    return cachedRead({
      key: `profile-posts:${username}`,
      tags: [cacheTags.profile(username)],
      load: () => readProfilePosts(username),
    });
  }

  return readProfilePosts(username, viewerUserId);
}

async function readProfilePosts(username: string, viewerUserId?: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(profiles.username, username),
        isNull(profiles.disabledAt),
        isNull(actors.blockedAt),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        viewerUserId
          ? or(eq(posts.visibility, "public"), eq(actors.userId, viewerUserId))
          : eq(posts.visibility, "public"),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(rows, viewerUserId);
}

export async function getActorProfilePosts(actorId: string, viewerUserId?: string) {
  if (!viewerUserId) {
    return cachedRead({
      key: `actor-profile-posts:${actorId}`,
      tags: [cacheTags.actor(actorId)],
      load: () => readActorProfilePosts(actorId),
    });
  }

  return readActorProfilePosts(actorId, viewerUserId);
}

async function readActorProfilePosts(actorId: string, viewerUserId?: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(actors.id, actorId),
        isNull(actors.blockedAt),
        or(isNull(profiles.userId), isNull(profiles.disabledAt)),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        or(eq(posts.visibility, "public"), eq(posts.visibility, "followers")),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(await visibleRows(rows, viewerUserId), viewerUserId);
}

export async function getPostsByHashtag(tag: string, viewerUserId?: string) {
  const normalized = tag.replace(/^#/, "").trim().toLowerCase();
  if (!normalized) return [];

  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(postTags.tag, normalized),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        isNull(actors.blockedAt),
        or(isNull(profiles.userId), isNull(profiles.disabledAt)),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  return mapPostRows(await visibleRows(rows, viewerUserId), viewerUserId);
}

export async function getPostByIdForViewer(postId: string, viewerUserId?: string) {
  if (!viewerUserId) {
    return cachedRead({
      key: `post:${postId}`,
      tags: [cacheTags.post(postId)],
      load: () => readPostByIdForViewer(postId),
    });
  }

  return readPostByIdForViewer(postId, viewerUserId);
}

async function readPostByIdForViewer(postId: string, viewerUserId?: string) {
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        eq(posts.id, postId),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        isNull(actors.blockedAt),
        or(isNull(profiles.userId), isNull(profiles.disabledAt)),
      ),
    )
    .limit(1);

  const [item] = await mapPostRows(await visibleRows(rows, viewerUserId), viewerUserId);
  return item ?? null;
}

export async function getZostThread(postId: string, viewerUserId?: string) {
  if (!viewerUserId) {
    return cachedRead({
      key: `thread:${postId}`,
      tags: [cacheTags.post(postId)],
      load: () => readZostThread(postId),
    });
  }

  return readZostThread(postId, viewerUserId);
}

async function readZostThread(postId: string, viewerUserId?: string) {
  const [target] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!target) return [];

  const ids = [postId, target.replyToPostId].filter(Boolean) as string[];
  const rows = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(
      and(
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        isNull(actors.blockedAt),
        or(isNull(profiles.userId), isNull(profiles.disabledAt)),
        or(inArray(posts.id, ids), eq(posts.replyToPostId, postId)),
      ),
    )
    .orderBy(posts.publishedAt);

  return mapPostRows(await visibleRows(rows, viewerUserId), viewerUserId);
}

async function mapPostRows(
  rows: Array<{
    post: typeof posts.$inferSelect;
    actor: typeof actors.$inferSelect;
    profile: typeof profiles.$inferSelect | null;
  }>,
  viewerUserId?: string,
) {
  const postIds = rows.map((row) => row.post.id);
  const [viewerActor] = viewerUserId
    ? await db
        .select({ id: actors.id })
        .from(actors)
        .where(and(eq(actors.userId, viewerUserId), eq(actors.type, "local")))
        .limit(1)
    : [];
  const mediaRows = postIds.length
    ? await db
        .select({ postId: postMedia.postId, media: mediaAssets })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
        .where(inArray(postMedia.postId, postIds))
        .orderBy(postMedia.position)
    : [];
  const [viewerLikes, viewerAnnounces, viewerBookmarks] =
    postIds.length && viewerUserId
      ? await Promise.all([
          viewerActor
            ? db
                .select({ postId: likes.postId })
                .from(likes)
                .where(and(eq(likes.actorId, viewerActor.id), inArray(likes.postId, postIds)))
            : [],
          viewerActor
            ? db
                .select({ postId: announces.postId })
                .from(announces)
                .where(and(eq(announces.actorId, viewerActor.id), inArray(announces.postId, postIds)))
            : [],
          db
            .select({ postId: bookmarks.postId })
            .from(bookmarks)
            .where(and(eq(bookmarks.userId, viewerUserId), inArray(bookmarks.postId, postIds))),
        ])
      : [[], [], []];
  const likedPostIds = new Set(viewerLikes.map((row) => row.postId));
  const announcedPostIds = new Set(viewerAnnounces.map((row) => row.postId));
  const bookmarkedPostIds = new Set(viewerBookmarks.map((row) => row.postId));

  return rows.map((row) => {
    const author = authorView(row);
    return {
      ...row,
      author,
      postHref: row.profile ? `/@${row.profile.username}/${row.post.id}` : `${author.href}/${row.post.id}`,
      media: mediaRows
        .filter((mediaRow) => mediaRow.postId === row.post.id)
        .map((mediaRow) => mediaRow.media),
      canDelete: row.actor.userId === viewerUserId,
      viewerHasLiked: likedPostIds.has(row.post.id),
      viewerHasAnnounced: announcedPostIds.has(row.post.id),
      viewerHasBookmarked: bookmarkedPostIds.has(row.post.id),
    };
  });
}

async function visibleRows<T extends { post: typeof posts.$inferSelect }>(
  rows: T[],
  viewerUserId?: string,
) {
  const visibility = await Promise.all(
    rows.map((row) => canViewPost(row.post.id, viewerUserId)),
  );
  return rows.filter((_row, index) => visibility[index]);
}

function authorView(row: {
  actor: typeof actors.$inferSelect;
  profile: typeof profiles.$inferSelect | null;
}) {
  if (row.profile) {
    return {
      displayName: row.profile.displayName,
      handle: `@${row.profile.username}`,
      href: `/@${row.profile.username}`,
      isRemote: false,
      avatarUrl: row.profile.avatarUrl,
    };
  }

  return {
    displayName: row.actor.name ?? row.actor.preferredUsername,
    handle: `@${row.actor.handle}@${row.actor.domain}`,
    href: actorProfileHref(row.actor),
    isRemote: true,
    avatarUrl: row.actor.avatarUrl,
  };
}
