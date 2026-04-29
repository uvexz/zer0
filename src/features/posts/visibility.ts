import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { actors, postRecipients, posts } from "@/db/schema";

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

  const [recipient] = await db
    .select()
    .from(postRecipients)
    .innerJoin(actors, eq(actors.id, postRecipients.actorId))
    .where(and(eq(postRecipients.postId, postId), eq(actors.userId, userId)))
    .limit(1);

  return Boolean(recipient);
}

export function publicVisibilityWhere() {
  return or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted"));
}
