import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { storage } from "@/features/media/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<unknown> }) {
  const { id } = (await context.params) as { id: string };
  const [media] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!media || !media.storageKey.startsWith("public/")) {
    return new Response("Not found", { status: 404 });
  }

  const publicUrl = storage.publicUrlForKey(media.storageKey);
  if (publicUrl) return Response.redirect(publicUrl, 302);

  const bytes = await storage.getObject(media.storageKey);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new Response(body, {
    headers: {
      "content-type": media.mimeType,
      "cache-control": "public, max-age=300",
    },
  });
}
