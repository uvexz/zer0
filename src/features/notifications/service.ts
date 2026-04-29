import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { actors, notifications, postMentions, posts, profiles } from "@/db/schema";
import { createId } from "@/lib/id";

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
  const usernames = Array.from(
    new Set(
      input.text
        .match(/(^|[\s(])@([a-zA-Z0-9_]{2,32})(?!@)/g)
        ?.map((match) => match.replace(/^[\s(]*@/, "").toLowerCase()) ?? [],
    ),
  );
  if (!usernames.length) return;

  const rows = await db
    .select({ userId: profiles.userId, username: profiles.username, actorId: actors.id })
    .from(profiles)
    .innerJoin(actors, eq(actors.userId, profiles.userId));

  const matches = rows.filter((row) => usernames.includes(row.username.toLowerCase()));
  if (!matches.length) return;

  await db
    .insert(postMentions)
    .values(
      matches.map((match) => ({
        postId: input.postId,
        actorId: match.actorId,
        handle: match.username,
      })),
    )
    .onConflictDoNothing();

  await Promise.all(
    matches.map((match) =>
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
