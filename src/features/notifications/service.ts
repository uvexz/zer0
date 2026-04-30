import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { actors, notifications, postMentions, posts, profiles } from "@/db/schema";
import { createId } from "@/lib/id";
import { mentionDisplay, mentionKey, parseZostText, type ParsedMention } from "@/lib/text";

export type NotificationType = "like" | "announce" | "reply" | "follow" | "mention";

export function shouldCreateNotification(input: {
  userId: string | null | undefined;
  actorUserId?: string | null;
}) {
  return Boolean(input.userId && input.userId !== input.actorUserId);
}

export function notificationDedupeKey(input: {
  userId: string;
  actorId: string;
  type: NotificationType;
  postId?: string | null;
}) {
  return [input.userId, input.actorId, input.type, input.postId ?? ""].join(":");
}

export async function createNotification(input: {
  userId: string | null | undefined;
  actorId: string;
  actorUserId?: string | null;
  type: NotificationType;
  postId?: string | null;
}) {
  const userId = input.userId;
  if (!shouldCreateNotification(input) || !userId) return null;

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, input.type),
        eq(notifications.actorId, input.actorId),
        input.postId ? eq(notifications.postId, input.postId) : isNull(notifications.postId),
      ),
    )
    .limit(1);

  if (existing) return null;

  const [notification] = await db
    .insert(notifications)
    .values({
      id: createId("notification"),
      userId,
      type: input.type,
      actorId: input.actorId,
      postId: input.postId ?? null,
    })
    .returning();

  return notification;
}

export async function createPostAuthorNotification(input: {
  postId: string;
  actorId: string;
  actorUserId?: string | null;
  type: Exclude<NotificationType, "follow" | "mention">;
  notificationPostId?: string;
}) {
  const [row] = await db
    .select({ authorUserId: actors.userId })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .where(eq(posts.id, input.postId))
    .limit(1);

  return createNotification({
    userId: row?.authorUserId,
    actorId: input.actorId,
    actorUserId: input.actorUserId,
    type: input.type,
    postId: input.notificationPostId ?? input.postId,
  });
}

export async function createFollowNotification(input: {
  followeeActorId: string;
  followerActorId: string;
  followerUserId?: string | null;
}) {
  const [followee] = await db
    .select({ userId: actors.userId })
    .from(actors)
    .where(eq(actors.id, input.followeeActorId))
    .limit(1);

  return createNotification({
    userId: followee?.userId,
    actorId: input.followerActorId,
    actorUserId: input.followerUserId,
    type: "follow",
  });
}

export async function createLocalMentionNotifications(input: {
  postId: string;
  actorId: string;
  actorUserId?: string | null;
  text: string;
}) {
  const mentions = parseZostText(input.text).mentions;
  if (!mentions.length) return;

  const rows = await db
    .select({
      userId: actors.userId,
      username: profiles.username,
      actorId: actors.id,
      handle: actors.handle,
      domain: actors.domain,
      uri: actors.uri,
    })
    .from(actors)
    .leftJoin(profiles, eq(profiles.userId, actors.userId));

  const matchesByMention = new Map(
    mentions.flatMap((mention) => {
      const actor = rows.find((row) => isMentionedActor(row, mention));
      return actor ? [[mentionKey(mention), actor] as const] : [];
    }),
  );

  await db
    .insert(postMentions)
    .values(
      mentions.map((mention) => {
        const actor = matchesByMention.get(mentionKey(mention));
        return {
          postId: input.postId,
          actorId: actor?.actorId ?? null,
          handle: mentionDisplay(mention).slice(1),
          href: actor?.uri ?? (mention.domain ? `https://${mention.domain}/@${mention.handle}` : null),
        };
      }),
    )
    .onConflictDoNothing();

  await Promise.all(
    Array.from(new Map(Array.from(matchesByMention.values()).map((match) => [match.actorId, match])).values()).map((match) =>
      createNotification({
        userId: match.userId,
        actorId: input.actorId,
        actorUserId: input.actorUserId,
        type: "mention",
        postId: input.postId,
      }),
    ),
  );
}

function isMentionedActor(
  actor: {
    handle: string;
    domain: string;
    username: string | null;
  },
  mention: ParsedMention,
) {
  const handle = actor.handle.toLowerCase();
  const domain = actor.domain.toLowerCase();
  const username = actor.username?.toLowerCase();

  if (mention.domain) return mention.handle === handle && mention.domain === domain;
  return mention.handle === username || mention.handle === handle;
}
