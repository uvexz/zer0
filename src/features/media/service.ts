import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { mediaAssets, mediaVariants, postMedia, posts } from "@/db/schema";
import type { ZostVisibility } from "@/features/posts/types";
import { createId } from "@/lib/id";
import { cacheTags } from "@/lib/cache-tags";
import { bumpCacheTags } from "@/lib/cache-version";
import { mediaProcessQueue } from "@/queue";
import { ZOST_MEDIA_ALLOWED_TYPES, ZOST_MEDIA_MAX_BYTES } from "@/features/posts/compose-limits";
import {
  finalizedMediaKey,
  isPublicMediaKey,
  pendingMediaKey,
  storage,
  variantStorageKey,
  type MediaVariantType,
} from "./storage";

const allowedMimeTypes = new Set<string>(ZOST_MEDIA_ALLOWED_TYPES);

export function isAllowedImageMimeType(mimeType: string) {
  return allowedMimeTypes.has(mimeType);
}

export function extensionForMime(mimeType: string) {
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

export async function saveUploadedMedia({
  ownerUserId,
  file,
  altText,
  sensitive,
}: {
  ownerUserId: string;
  file: File;
  altText: string;
  sensitive?: boolean;
}) {
  if (!file.size) return null;
  if (!isAllowedImageMimeType(file.type)) {
    throw new Error("Unsupported image type.");
  }
  if (file.size > ZOST_MEDIA_MAX_BYTES) {
    throw new Error("Image is larger than 8MB.");
  }

  const id = createId("media");
  const extension = extensionForMime(file.type);
  const key = pendingMediaKey(ownerUserId, id, extension);
  const bytes = new Uint8Array(await file.arrayBuffer());

  await storage.putObject(key, bytes, file.type);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      ownerUserId,
      storageKey: key,
      mimeType: file.type,
      byteSize: file.size,
      altText,
      sensitive: Boolean(sensitive),
      processingStatus: "pending",
    })
    .returning();

  return asset;
}

export async function savePublicProfileMedia({
  ownerUserId,
  file,
  kind,
}: {
  ownerUserId: string;
  file: File;
  kind: "avatar" | "header";
}) {
  if (!file.size) return null;
  if (!isAllowedImageMimeType(file.type)) {
    throw new Error("Unsupported image type.");
  }
  if (file.size > ZOST_MEDIA_MAX_BYTES) {
    throw new Error("Image is larger than 8MB.");
  }

  const id = createId("media");
  const extension = extensionForMime(file.type);
  const key = `public/${ownerUserId}/profile/${kind}-${id}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage.putObject(key, bytes, file.type);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      ownerUserId,
      storageKey: key,
      mimeType: file.type,
      byteSize: file.size,
      altText: kind === "avatar" ? "Profile avatar" : "Profile header image",
      processingStatus: "pending",
    })
    .returning();

  await enqueueMediaProcessing(asset.id);

  return {
    asset,
    url: storage.publicUrlForKey(key) ?? `/api/profile-media/${asset.id}`,
  };
}

export async function finalizePostMedia(postId: string, visibility: ZostVisibility) {
  const rows = await db
    .select({ media: mediaAssets })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
    .where(eq(postMedia.postId, postId));

  for (const { media } of rows) {
    await moveMediaToVisibility(media, visibility);
    await enqueueMediaProcessing(media.id);
    await bumpCacheTags([cacheTags.media(media.id), cacheTags.post(postId)]);
  }
}

export async function enqueueMediaProcessing(mediaId: string) {
  await mediaProcessQueue.add("process", { mediaId });
}

export async function processMediaAsset(mediaId: string) {
  const [media] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
  if (!media || media.remoteUrl) return;

  await db
    .update(mediaAssets)
    .set({ processingStatus: "processing", processingError: null })
    .where(eq(mediaAssets.id, media.id));

  try {
    const bytes = await storage.getObject(media.storageKey);
    const image = sharp(bytes, { animated: media.mimeType === "image/gif" });
    const metadata = await image.metadata();
    const actualMime = mimeTypeForFormat(metadata.format);
    if (!actualMime || !isAllowedImageMimeType(actualMime)) {
      throw new Error("Unsupported or unreadable image data.");
    }

    if (actualMime !== "image/gif") {
      await Promise.all([
        writeVariant(media.id, media.storageKey, "preview", bytes, 1200),
        writeVariant(media.id, media.storageKey, "thumbnail", bytes, 480),
      ]);
    }

    await db
      .update(mediaAssets)
      .set({
        mimeType: actualMime,
        width: metadata.width,
        height: metadata.height,
        processingStatus: "processed",
        processingError: null,
        processedAt: new Date(),
      })
      .where(eq(mediaAssets.id, media.id));
    await bumpCacheTags([cacheTags.media(media.id)]);
  } catch (error) {
    await db
      .update(mediaAssets)
      .set({
        processingStatus: "failed",
        processingError: error instanceof Error ? error.message : "Unknown media processing error.",
      })
      .where(eq(mediaAssets.id, media.id));
    throw error;
  }
}

export async function getMediaServeTarget(input: {
  mediaId: string;
  variant: MediaVariantType;
}) {
  return cachedReadMediaServeTarget(input);
}

async function cachedReadMediaServeTarget(input: {
  mediaId: string;
  variant: MediaVariantType;
}) {
  const { cachedRead } = await import("@/lib/cached-read");
  return cachedRead({
    key: `media-serve-target:${input.mediaId}:${input.variant}`,
    tags: [cacheTags.media(input.mediaId)],
    load: () => readMediaServeTarget(input),
  });
}

async function readMediaServeTarget(input: {
  mediaId: string;
  variant: MediaVariantType;
}) {
  const [row] = await db
    .select({ media: mediaAssets, postId: postMedia.postId, postVisibility: posts.visibility })
    .from(mediaAssets)
    .leftJoin(postMedia, eq(postMedia.mediaId, mediaAssets.id))
    .leftJoin(posts, eq(posts.id, postMedia.postId))
    .where(eq(mediaAssets.id, input.mediaId))
    .limit(1);

  if (!row) return null;

  const variant = input.variant === "original"
    ? null
    : await findVariant(row.media.id, input.variant);
  const target = resolveVariantStorageTarget(
    { storageKey: row.media.storageKey, mimeType: row.media.mimeType },
    variant
      ? { storageKey: variant.storageKey, mimeType: variant.mimeType }
      : null,
  );
  const remoteUrl = row.media.remoteUrl && !variant ? row.media.remoteUrl : null;

  return {
    media: row.media,
    postId: row.postId,
    postVisibility: row.postVisibility,
    storageKey: target.storageKey,
    mimeType: target.mimeType,
    remoteUrl,
    publicUrl: storage.publicUrlForKey(target.storageKey),
  };
}

export function mediaDisplayUrl(input: {
  mediaId: string;
  storageKey: string;
  variant?: MediaVariantType;
}) {
  const publicUrl = storage.publicUrlForKey(input.storageKey);
  if (publicUrl) return publicUrl;

  const params = input.variant && input.variant !== "original"
    ? `?variant=${input.variant}`
    : "";
  return `/api/media/${input.mediaId}${params}`;
}

export function shouldFoldSensitiveMedia(sensitive: boolean) {
  return sensitive;
}

export function resolveVariantStorageTarget<T extends { storageKey: string; mimeType: string }>(
  original: T,
  variant?: T | null,
) {
  return variant ?? original;
}

async function moveMediaToVisibility(
  media: typeof mediaAssets.$inferSelect,
  visibility: ZostVisibility,
) {
  if (!media.ownerUserId || media.remoteUrl) return;
  if (!media.storageKey.startsWith("pending/")) return;

  const extension = extensionForMime(media.mimeType);
  const key = finalizedMediaKey({
    ownerUserId: media.ownerUserId,
    mediaId: media.id,
    extension,
    visibility,
  });

  try {
    const bytes = await storage.getObject(media.storageKey);
    await storage.putObject(key, bytes, media.mimeType);
    await storage.deleteObject(media.storageKey);
    await db
      .update(mediaAssets)
      .set({ storageKey: key })
      .where(eq(mediaAssets.id, media.id));
  } catch {
    // Keep the pending key as a serving fallback. Processing can still continue from the original key.
  }
}

async function writeVariant(
  mediaId: string,
  originalKey: string,
  type: Exclude<MediaVariantType, "original">,
  bytes: Uint8Array,
  width: number,
) {
  const output = await sharp(bytes)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: type === "thumbnail" ? 72 : 82 })
    .toBuffer({ resolveWithObject: true });
  const key = variantStorageKey(originalKey, type);

  await storage.putObject(key, output.data, "image/webp");
  await db
    .insert(mediaVariants)
    .values({
      id: createId("media_variant"),
      mediaId,
      type,
      storageKey: key,
      mimeType: "image/webp",
      byteSize: output.data.byteLength,
      width: output.info.width,
      height: output.info.height,
    })
    .onConflictDoUpdate({
      target: [mediaVariants.mediaId, mediaVariants.type],
      set: {
        storageKey: key,
        mimeType: "image/webp",
        byteSize: output.data.byteLength,
        width: output.info.width,
        height: output.info.height,
      },
    });
}

async function findVariant(mediaId: string, type: Exclude<MediaVariantType, "original">) {
  const [variant] = await db
    .select()
    .from(mediaVariants)
    .where(and(eq(mediaVariants.mediaId, mediaId), eq(mediaVariants.type, type)))
    .limit(1);

  return variant ?? null;
}

function mimeTypeForFormat(format?: string) {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

export { isPublicMediaKey };
