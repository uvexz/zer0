import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { actors, follows, postRecipients, posts } from "@/db/schema";

export function canViewPostByPolicy(input: {
  visibility: "public" | "unlisted" | "followers" | "direct";
  viewerUserId?: string | null;
  authorUserId?: string | null;
  isExplicitRecipient: boolean;
  isAcceptedFollower: boolean;
}) {
  if (input.visibility === "public" || input.visibility === "unlisted") return true;
  if (!input.viewerUserId) return false;
  if (input.authorUserId === input.viewerUserId) return true;
  if (input.visibility === "direct") return input.isExplicitRecipient;
  return input.isAcceptedFollower;
}

export async function canViewPost(postId: string, userId?: string) {
  const [row] = await db
    .select({ post: posts, author: actors })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row || row.post.deletedAt || row.post.hiddenAt) return false;
  if (row.post.visibility === "public" || row.post.visibility === "unlisted") return true;
  if (!userId) return false;
  if (row.author.userId === userId) return true;

  const [viewerActor] = await db
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.userId, userId), eq(actors.type, "local")))
    .limit(1);
  if (!viewerActor) return false;

  const [recipient] = await db
    .select()
    .from(postRecipients)
    .where(and(eq(postRecipients.postId, postId), eq(postRecipients.actorId, viewerActor.id)))
    .limit(1);

  if (row.post.visibility === "direct") return Boolean(recipient);

  const [follow] = await db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerActorId, viewerActor.id),
        eq(follows.followeeActorId, row.author.id),
        eq(follows.state, "accepted"),
      ),
    )
    .limit(1);

  return Boolean(follow);
}

export function publicVisibilityWhere() {
  return or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted"));
}
