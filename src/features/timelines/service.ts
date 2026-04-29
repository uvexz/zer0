import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  actors,
  follows,
  postRecipients,
  posts,
  timelineItems,
} from "@/db/schema";
import { isDomainBlocked } from "@/features/federation/remote";
import { createId } from "@/lib/id";
import { timelineFanoutQueue } from "@/queue";
import { resolveTimelineTargets } from "./policy";

export async function enqueueTimelineFanout(postId: string) {
  await timelineFanoutQueue.add("fanout", { postId });
}

export async function fanoutPostToTimelines(postId: string) {
  const [row] = await db
    .select({ post: posts, author: actors })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row) return;
  if (row.author.type === "remote" && (await isDomainBlocked(row.author.domain))) return;

  const acceptedFollowerUserIds = await localFollowerUserIds(row.author.id);
  const recipientUserIds = row.post.visibility === "direct"
    ? await localRecipientUserIds(row.post.id)
    : [];

  const targets = resolveTimelineTargets({
    visibility: row.post.visibility,
    authorUserId: row.author.userId,
    acceptedFollowerUserIds,
    recipientUserIds,
    deletedAt: row.post.deletedAt,
    hiddenAt: row.post.hiddenAt,
    authorBlockedAt: row.author.blockedAt,
  });

  if (!targets.length) return;

  await db
    .insert(timelineItems)
    .values(
      targets.map((target) => ({
        id: createId("timeline"),
        userId: target.userId,
        postId: row.post.id,
        reason: target.reason,
        createdAt: row.post.publishedAt,
      })),
    )
    .onConflictDoNothing();
}

export async function enqueueActorTimelineBackfill(actorId: string) {
  const rows = await db
    .select({ postId: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.authorActorId, actorId),
        isNull(posts.deletedAt),
        isNull(posts.hiddenAt),
        inArray(posts.visibility, ["public", "unlisted", "followers"]),
      ),
    );

  await Promise.all(rows.map((row) => enqueueTimelineFanout(row.postId)));
}

async function localFollowerUserIds(actorId: string) {
  const rows = await db
    .select({ userId: actors.userId })
    .from(follows)
    .innerJoin(actors, eq(actors.id, follows.followerActorId))
    .where(and(eq(follows.followeeActorId, actorId), eq(follows.state, "accepted")));

  return rows.map((row) => row.userId).filter((userId): userId is string => Boolean(userId));
}

async function localRecipientUserIds(postId: string) {
  const rows = await db
    .select({ userId: actors.userId })
    .from(postRecipients)
    .innerJoin(actors, eq(actors.id, postRecipients.actorId))
    .where(eq(postRecipients.postId, postId));

  return rows.map((row) => row.userId).filter((userId): userId is string => Boolean(userId));
}
