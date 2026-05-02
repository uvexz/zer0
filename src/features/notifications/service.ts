import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { actors, notifications, postMentions, posts, profiles } from "@/db/schema";
import { isActorMentioned } from "@/features/accounts/mentions";
import { createId } from "@/lib/id";
import { mentionDisplay, mentionKey, parseZostText } from "@/lib/text";
import { notificationsQueue, type NotificationJob } from "@/queue";

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

export async function enqueuePostAuthorNotification(input: {
  postId: string;
  actorId: string;
  actorUserId?: string | null;
  type: Exclude<NotificationType, "follow" | "mention">;
  notificationPostId?: string | null;
}) {
  await notificationsQueue.add("create", {
    kind: "post-author",
    postId: input.postId,
    actorId: input.actorId,
    actorUserId: input.actorUserId,
    notificationType: input.type,
    notificationPostId: input.notificationPostId,
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

export async function enqueueFollowNotification(input: {
  followeeActorId: string;
  followerActorId: string;
  followerUserId?: string | null;
}) {
  await notificationsQueue.add("create", { kind: "follow", ...input });
}

export async function processNotificationJob(job: NotificationJob) {
  switch (job.kind) {
    case "follow":
      return createFollowNotification(job);
    case "post-author":
      return createPostAuthorNotification({
        postId: job.postId,
        actorId: job.actorId,
        actorUserId: job.actorUserId,
        type: job.notificationType,
        notificationPostId: job.notificationPostId ?? undefined,
      });
    case "mention":
      return createNotification({
        userId: job.userId,
        actorId: job.actorId,
        actorUserId: job.actorUserId,
        type: "mention",
        postId: job.postId,
      });
  }
}

export async function enqueueMentionNotification(input: {
  userId: string | null | undefined;
  actorId: string;
  actorUserId?: string | null;
  postId: string;
}) {
  await notificationsQueue.add("create", {
    kind: "mention",
    userId: input.userId ?? null,
    actorId: input.actorId,
    actorUserId: input.actorUserId,
    postId: input.postId,
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
      type: actors.type,
      handle: actors.handle,
      domain: actors.domain,
      uri: actors.uri,
    })
    .from(actors)
    .leftJoin(profiles, eq(profiles.userId, actors.userId));

  const matchesByMention = new Map(
    mentions.flatMap((mention) => {
      const actor = rows.find((row) => isActorMentioned(row, mention));
      return actor ? [[mentionKey(mention), actor] as const] : [];
    }),
  );

  const mentionRows = Array.from(matchesByMention.entries()).map(([key, actor]) => {
    const mention = mentions.find((item) => mentionKey(item) === key)!;
    return {
      postId: input.postId,
      actorId: actor.actorId,
      handle: mentionDisplay(mention).slice(1),
      href: actor.uri,
    };
  });

  if (mentionRows.length) {
    await db.insert(postMentions).values(mentionRows).onConflictDoNothing();
  }

  await Promise.all(
    Array.from(new Map(Array.from(matchesByMention.values()).map((match) => [match.actorId, match])).values()).map((match) =>
      enqueueMentionNotification({
        userId: match.userId,
        actorId: input.actorId,
        actorUserId: input.actorUserId,
        postId: input.postId,
      }),
    ),
  );
}
