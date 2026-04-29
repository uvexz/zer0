import sharp from "sharp";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { createId } from "@/lib/id";
import { storage } from "./storage";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const maxImageBytes = 8 * 1024 * 1024;

export async function saveUploadedMedia({
  ownerUserId,
  file,
  altText,
}: {
  ownerUserId: string;
  file: File;
  altText: string;
}) {
  if (!file.size) return null;
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error("Unsupported image type.");
  }
  if (file.size > maxImageBytes) {
    throw new Error("Image is larger than 8MB.");
  }

  const id = createId("media");
  const extension = extensionForMime(file.type);
  const key = `${ownerUserId}/${id}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = await sharp(bytes, { animated: file.type === "image/gif" }).metadata();

  await storage.putObject(key, bytes);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      ownerUserId,
      storageKey: key,
      mimeType: file.type,
      byteSize: file.size,
      width: metadata.width,
      height: metadata.height,
      altText,
    })
    .returning();

  return asset;
}

function extensionForMime(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
