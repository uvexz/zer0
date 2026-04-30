"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  actors,
  activities,
  announces,
  bookmarks,
  likes,
  mediaAssets,
  postMedia,
  postRecipients,
  postTags,
  posts,
  profiles,
} from "@/db/schema";
import { ensureLocalActor } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { createOutgoingActivity } from "@/features/federation/outgoing";
import { finalizePostMedia, saveUploadedMedia } from "@/features/media/service";
import {
  createLocalMentionNotifications,
  enqueuePostAuthorNotification,
} from "@/features/notifications/service";
import { fanoutPostToTimelines } from "@/features/timelines/service";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashtagHref, plainTextToHtml, parseZostText, type ParsedMention } from "@/lib/text";
import {
  formatBytes,
  ZOST_CONTENT_MAX_CHARS,
  ZOST_MEDIA_ALLOWED_TYPES,
  ZOST_MEDIA_MAX_BYTES,
  ZOST_MEDIA_MAX_FILES,
  ZOST_MEDIA_TOTAL_MAX_BYTES,
} from "./compose-limits";
import { isZostVisibility } from "./types";

export type CreateZostActionState = {
  error?: string;
  ok?: boolean;
};

export async function createZostAction(
  _previousState: CreateZostActionState,
  formData: FormData,
): Promise<CreateZostActionState> {
  try {
    await createZost(formData);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to publish this zost." };
  }
}

async function createZost(formData: FormData) {
  const { session, profile } = await requireUser();
  const content = String(formData.get("content") ?? "").trim();
  const visibilityValue = formData.get("visibility");
  const visibility = isZostVisibility(visibilityValue) ? visibilityValue : "public";
  const replyToPostId = optionalString(formData.get("replyToPostId"));
  const parsedText = parseZostText(content);
  const directMentionHandles = visibility === "direct" ? parsedText.mentions : [];
  const files = formData.getAll("media").filter((value): value is File => value instanceof File && value.size > 0);
  const mediaAltTexts = formData.getAll("mediaAltText").map((value) => String(value ?? ""));
  const sensitiveMediaIndexes = new Set(
    formData
      .getAll("mediaSensitive")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0),
  );
  const sensitiveMedia = sensitiveMediaIndexes.size > 0 || formData.get("sensitiveMedia") === "on";

  if (!content) throw new Error("Zost content is required.");
  if (content.length > ZOST_CONTENT_MAX_CHARS) {
    throw new Error(`Zost content must be ${ZOST_CONTENT_MAX_CHARS} characters or fewer.`);
  }
  if (files.length > ZOST_MEDIA_MAX_FILES) {
    throw new Error(`Zosts can include at most ${ZOST_MEDIA_MAX_FILES} images.`);
  }

  const totalMediaBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalMediaBytes > ZOST_MEDIA_TOTAL_MAX_BYTES) {
    throw new Error(`Uploads must be ${formatBytes(ZOST_MEDIA_TOTAL_MAX_BYTES)} total or smaller.`);
  }
  for (const file of files) {
    if (!ZOST_MEDIA_ALLOWED_TYPES.includes(file.type as (typeof ZOST_MEDIA_ALLOWED_TYPES)[number])) {
      throw new Error("Uploads must be JPEG, PNG, WebP, or GIF images.");
    }
    if (file.size > ZOST_MEDIA_MAX_BYTES) {
      throw new Error(`Each image must be ${formatBytes(ZOST_MEDIA_MAX_BYTES)} or smaller.`);
    }
  }

  const actor = await ensureLocalActor(session.user.id);
  const id = createId("zost");
  const url = `${env.APP_ORIGIN}/@${profile.username}/${id}`;
  const uri = `${env.APP_ORIGIN}/objects/${id}`;

  if (files.length) {
    const uploadLimit = checkRateLimit(`upload:${session.user.id}`, {
      limit: 40,
      windowMs: 60 * 60_000,
    });
    if (!uploadLimit.ok) throw new Error("Too many media uploads. Try again later.");
  }

  const media: Array<typeof mediaAssets.$inferSelect> = [];
  for (const [index, file] of files.entries()) {
    const saved = await saveUploadedMedia({
      ownerUserId: session.user.id,
      file,
      altText: mediaAltTexts[index] ?? String(formData.get("altText") ?? ""),
      sensitive: sensitiveMediaIndexes.has(index) || formData.get("sensitiveMedia") === "on",
    });
    if (saved) media.push(saved);
  }

  await db.transaction(async (tx) => {
    await tx.insert(posts).values({
      id,
      uri,
      url,
      authorActorId: actor.id,
      contentText: content,
      contentHtml: plainTextToHtml(content, { origin: env.APP_ORIGIN }),
      visibility,
      replyToPostId,
      replyToUri: replyToPostId ? `${env.APP_ORIGIN}/objects/${replyToPostId}` : null,
      sensitive: sensitiveMedia,
    });

    if (media.length) {
      await tx.insert(postMedia).values(
        media.map((asset, index) => ({
          postId: id,
          mediaId: asset.id,
          position: index,
        })),
      );
    }

    if (parsedText.hashtags.length) {
      await tx
        .insert(postTags)
        .values(
          parsedText.hashtags.map((hashtag) => ({
            postId: id,
            tag: hashtag.tag.toLowerCase(),
            href: hashtagHref(hashtag.tag, env.APP_ORIGIN),
          })),
        )
        .onConflictDoNothing();
    }

    if (visibility === "direct" && directMentionHandles.length) {
      const recipients = await tx
        .select({ actorId: actors.id, handle: actors.handle, domain: actors.domain, username: profiles.username })
        .from(actors)
        .leftJoin(profiles, eq(profiles.userId, actors.userId));

      const matchingActors = recipients.filter((recipient) => isMentionedActor(recipient, directMentionHandles));

      if (matchingActors.length) {
        await tx
          .insert(postRecipients)
          .values(matchingActors.map((recipient) => ({ postId: id, actorId: recipient.actorId })))
          .onConflictDoNothing();
      }
    }
  });

  await fanoutPostToTimelines(id);
  await finalizePostMedia(id, visibility);
  if (replyToPostId) {
    await enqueuePostAuthorNotification({
      postId: replyToPostId,
      actorId: actor.id,
      actorUserId: session.user.id,
      type: "reply",
      notificationPostId: id,
    });
  }
  await createLocalMentionNotifications({
    postId: id,
    actorId: actor.id,
    actorUserId: session.user.id,
    text: content,
  });
  await createOutgoingActivity({
    type: "Create",
    actorId: actor.id,
    objectUri: uri,
  });

  revalidatePath("/");
  revalidatePath(`/@${profile.username}`);
}

export async function likeZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  const [like] = await db
    .insert(likes)
    .values({ actorId: actor.id, postId })
    .onConflictDoNothing()
    .returning();
  const post = await postById(postId);
  if (like && post) {
    await createOutgoingActivity({
      type: "Like",
      actorId: actor.id,
      objectUri: post.uri,
    });
  }
  if (like) {
    await enqueuePostAuthorNotification({
      postId,
      actorId: actor.id,
      actorUserId: session.user.id,
      type: "like",
    });
  }
  revalidatePath("/");
}

export async function unlikeZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  const post = await postById(postId);

  await db.delete(likes).where(and(eq(likes.actorId, actor.id), eq(likes.postId, postId)));

  if (post) {
    const original = await latestOutgoingActivity({
      type: "Like",
      actorId: actor.id,
      objectUri: post.uri,
    });
    const author = await actorById(post.authorActorId);
    if (original && author?.type === "remote") {
      await createOutgoingActivity({
        type: "Undo",
        actorId: actor.id,
        objectUri: original.uri,
        targetUri: author.uri,
      });
    }
  }

  revalidatePath("/");
}

export async function announceZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  const [announce] = await db
    .insert(announces)
    .values({ actorId: actor.id, postId })
    .onConflictDoNothing()
    .returning();
  const post = await postById(postId);
  if (announce && post) {
    await createOutgoingActivity({
      type: "Announce",
      actorId: actor.id,
      objectUri: post.uri,
    });
  }
  if (announce) {
    await enqueuePostAuthorNotification({
      postId,
      actorId: actor.id,
      actorUserId: session.user.id,
      type: "announce",
    });
  }
  revalidatePath("/");
}

export async function unannounceZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  const post = await postById(postId);

  await db
    .delete(announces)
    .where(and(eq(announces.actorId, actor.id), eq(announces.postId, postId)));

  if (post) {
    const original = await latestOutgoingActivity({
      type: "Announce",
      actorId: actor.id,
      objectUri: post.uri,
    });
    const author = await actorById(post.authorActorId);
    if (original && author?.type === "remote") {
      await createOutgoingActivity({
        type: "Undo",
        actorId: actor.id,
        objectUri: original.uri,
        targetUri: author.uri,
      });
    }
  }

  revalidatePath("/");
}

export async function bookmarkZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  await db.insert(bookmarks).values({ userId: session.user.id, postId }).onConflictDoNothing();
  revalidatePath("/");
}

export async function deleteZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  const [post] = await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.authorActorId, actor.id)))
    .returning();
  if (post) {
    await createOutgoingActivity({
      type: "Delete",
      actorId: actor.id,
      objectUri: post.uri,
    });
  }
  revalidatePath("/");
}

async function postById(postId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return post ?? null;
}

async function actorById(actorId: string) {
  const [actor] = await db.select().from(actors).where(eq(actors.id, actorId)).limit(1);
  return actor ?? null;
}

async function latestOutgoingActivity(input: {
  type: string;
  actorId: string;
  objectUri: string;
}) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.direction, "outgoing"),
        eq(activities.type, input.type),
        eq(activities.actorId, input.actorId),
        eq(activities.objectUri, input.objectUri),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(1);

  return activity ?? null;
}

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function isMentionedActor(
  actor: {
    handle: string;
    domain: string;
    username: string | null;
  },
  mentions: ParsedMention[],
) {
  const handle = actor.handle.toLowerCase();
  const domain = actor.domain.toLowerCase();
  const username = actor.username?.toLowerCase();

  return mentions.some((mention) => {
    if (mention.domain) return mention.handle === handle && mention.domain === domain;
    return mention.handle === username || mention.handle === handle;
  });
}
