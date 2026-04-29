import { eq } from "drizzle-orm";
import { getSession } from "@/features/auth/auth";
import { canViewPost } from "@/features/posts/visibility";
import { storage } from "@/features/media/storage";
import { db } from "@/db";
import { mediaAssets, postMedia } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<unknown> }) {
  const { id } = (await context.params) as { id: string };
  const [row] = await db
    .select({ media: mediaAssets, postId: postMedia.postId })
    .from(mediaAssets)
    .leftJoin(postMedia, eq(postMedia.mediaId, mediaAssets.id))
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  const session = await getSession();
  const canView = row.postId ? await canViewPost(row.postId, session?.user.id) : row.media.ownerUserId === session?.user.id;
  if (!canView) return new Response("Not found", { status: 404 });

  if (row.media.remoteUrl) {
    return Response.redirect(row.media.remoteUrl, 302);
  }

  const bytes = await storage.getObject(row.media.storageKey);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new Response(body, {
    headers: {
      "content-type": row.media.mimeType,
      "cache-control": "private, max-age=300",
    },
  });
}
