import { getSession } from "@/features/auth/auth";
import { getMediaServeTarget } from "@/features/media/service";
import type { MediaVariantType } from "@/features/media/storage";
import { canViewPost } from "@/features/posts/visibility";
import { storage } from "@/features/media/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<unknown> }) {
  const { id } = (await context.params) as { id: string };
  const variant = mediaVariantFromRequest(request);
  const row = await getMediaServeTarget({ mediaId: id, variant });

  if (!row) return new Response("Not found", { status: 404 });

  const session = await getSession();
  const canView = row.postId ? await canViewPost(row.postId, session?.user.id) : row.media.ownerUserId === session?.user.id;
  if (!canView) return new Response("Not found", { status: 404 });

  if (row.publicUrl) {
    return Response.redirect(row.publicUrl, 302);
  }

  if (row.remoteUrl) {
    return Response.redirect(row.remoteUrl, 302);
  }

  const bytes = await storage.getObject(row.storageKey);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new Response(body, {
    headers: {
      "content-type": row.mimeType,
      "cache-control": "private, max-age=300",
    },
  });
}

function mediaVariantFromRequest(request: Request): MediaVariantType {
  const variant = new URL(request.url).searchParams.get("variant");
  return variant === "preview" || variant === "thumbnail" ? variant : "original";
}
