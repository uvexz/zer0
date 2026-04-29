"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  actors,
  announces,
  bookmarks,
  likes,
  notifications,
  postMedia,
  postRecipients,
  posts,
  profiles,
  mediaAssets,
} from "@/db/schema";
import { ensureLocalActor } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { createOutgoingActivity } from "@/features/federation/outgoing";
import { saveUploadedMedia } from "@/features/media/service";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { plainTextToHtml } from "@/lib/text";
import { isZostVisibility } from "./types";

export async function createZostAction(formData: FormData) {
  const { session, profile } = await requireUser();
  const content = String(formData.get("content") ?? "").trim();
  const visibilityValue = formData.get("visibility");
  const visibility = isZostVisibility(visibilityValue) ? visibilityValue : "public";
  const replyToPostId = optionalString(formData.get("replyToPostId"));
  const recipientHandles = String(formData.get("recipientHandles") ?? "")
    .split(/[,\s]+/)
    .map((handle) => handle.replace(/^@/, "").trim())
    .filter(Boolean);

  if (!content) throw new Error("Zost content is required.");

  const actor = await ensureLocalActor(session.user.id);
  const id = createId("zost");
  const url = `${env.APP_ORIGIN}/@${profile.username}/${id}`;
  const uri = `${env.APP_ORIGIN}/objects/${id}`;
  const files = formData.getAll("media").filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length > 4) throw new Error("Zosts can include at most 4 images.");
  if (files.length) {
    const uploadLimit = checkRateLimit(`upload:${session.user.id}`, {
      limit: 40,
      windowMs: 60 * 60_000,
    });
    if (!uploadLimit.ok) throw new Error("Too many media uploads. Try again later.");
  }

  const media: Array<typeof mediaAssets.$inferSelect> = [];
  for (const file of files) {
    const saved = await saveUploadedMedia({
      ownerUserId: session.user.id,
      file,
      altText: String(formData.get("altText") ?? ""),
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
      contentHtml: plainTextToHtml(content),
      visibility,
      replyToPostId,
      replyToUri: replyToPostId ? `${env.APP_ORIGIN}/objects/${replyToPostId}` : null,
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

    if (visibility === "direct" && recipientHandles.length) {
      const recipients = await tx
        .select({ actorId: actors.id, username: profiles.username })
        .from(profiles)
        .innerJoin(actors, eq(actors.userId, profiles.userId))
        .where(and(eq(actors.type, "local")));

      const matchingActors = recipients.filter((recipient) =>
        recipientHandles.some((handle) => recipient.username.toLowerCase() === handle.toLowerCase()),
      );

      if (matchingActors.length) {
        await tx
          .insert(postRecipients)
          .values(matchingActors.map((recipient) => ({ postId: id, actorId: recipient.actorId })))
          .onConflictDoNothing();
      }
    }
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
  await db.insert(likes).values({ actorId: actor.id, postId }).onConflictDoNothing();
  const post = await postById(postId);
  if (post) {
    await createOutgoingActivity({
      type: "Like",
      actorId: actor.id,
      objectUri: post.uri,
    });
  }
  await createPostNotification(postId, session.user.id, "like");
  revalidatePath("/");
}

export async function announceZostAction(formData: FormData) {
  const { session } = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const actor = await ensureLocalActor(session.user.id);
  await db.insert(announces).values({ actorId: actor.id, postId }).onConflictDoNothing();
  const post = await postById(postId);
  if (post) {
    await createOutgoingActivity({
      type: "Announce",
      actorId: actor.id,
      objectUri: post.uri,
    });
  }
  await createPostNotification(postId, session.user.id, "announce");
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

async function createPostNotification(postId: string, actorUserId: string, type: string) {
  const [row] = await db
    .select({ authorUserId: actors.userId, actorId: actors.id })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row?.authorUserId || row.authorUserId === actorUserId) return;

  const actingActor = await ensureLocalActor(actorUserId);
  await db.insert(notifications).values({
    id: createId("notification"),
    userId: row.authorUserId,
    type,
    actorId: actingActor.id,
    postId,
  });
}

async function postById(postId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return post ?? null;
}

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
