import {
  Accept,
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Person,
  Reject,
  Undo,
  Update,
  type Activity,
  type Note,
} from "@fedify/fedify/vocab";
import { and, eq } from "drizzle-orm";
import type { InboxContext, RequestContext, UnverifiedActivityReason } from "@fedify/fedify";
import { db } from "@/db";
import {
  activities,
  actors,
  announces,
  follows,
  inboxEvents,
  likes,
  mediaAssets,
  postMedia,
  postMentions,
  postTags,
  posts,
} from "@/db/schema";
import { createId } from "@/lib/id";
import { sanitizeRemoteHtml } from "@/lib/text";
import {
  createNotification,
  createFollowNotification,
  createPostAuthorNotification,
} from "@/features/notifications/service";
import {
  enqueueActorTimelineBackfill,
  enqueueTimelineFanout,
} from "@/features/timelines/service";
import { createOutgoingActivity } from "./outgoing";
import { fetchJson, isDomainBlocked, upsertRemoteActorFromJson } from "./remote";

export async function handleIncomingFollow(ctx: InboxContext<unknown>, activity: Follow) {
  const remoteActor = await actorFromActivity(activity);
  const localActorUri = activity.objectId?.href;
  const localActor = localActorUri ? await actorByUri(localActorUri) : null;
  const rawJson = await toJson(activity);

  await recordIncoming(activity, "accepted", rawJson);
  if (!remoteActor || !localActor || localActor.type !== "local") return;
  if (await isDomainBlocked(remoteActor.domain)) return;

  await db
    .insert(follows)
    .values({
      followerActorId: remoteActor.id,
      followeeActorId: localActor.id,
      state: "accepted",
      activityUri: activity.id?.href,
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: {
        state: "accepted",
        activityUri: activity.id?.href,
        updatedAt: new Date(),
      },
    });
  await createFollowNotification({
    followeeActorId: localActor.id,
    followerActorId: remoteActor.id,
    followerUserId: remoteActor.userId,
  });

  await createOutgoingActivity({
    type: "Accept",
    actorId: localActor.id,
    objectUri: activity.id?.href,
    targetUri: remoteActor.uri,
    rawJson,
  });
}

export async function handleIncomingAccept(ctx: InboxContext<unknown>, activity: Accept) {
  await handleFollowResponse(ctx, activity, "accepted");
}

export async function handleIncomingReject(ctx: InboxContext<unknown>, activity: Reject) {
  await handleFollowResponse(ctx, activity, "rejected");
}

export async function handleIncomingCreate(ctx: InboxContext<unknown>, activity: Create) {
  const remoteActor = await actorFromActivity(activity);
  const object = await activity.getObject({
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);

  if (!remoteActor || !object?.id) return;
  if (await isDomainBlocked(remoteActor.domain)) return;

  const post = await persistRemoteNote(remoteActor, object as Note, rawJson);
  if (!post) return;

  await enqueueTimelineFanout(post.id);
  if (post.replyToUri) {
    const parent = await postByUri(post.replyToUri);
    if (parent) {
      await createPostAuthorNotification({
        postId: parent.id,
        actorId: remoteActor.id,
        actorUserId: remoteActor.userId,
        type: "reply",
        notificationPostId: post.id,
      });
    }
  }
}

export async function handleIncomingDelete(activity: Delete) {
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  const objectUri = activity.objectId?.href;
  if (!objectUri) return;
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.uri, objectUri));
}

export async function handleIncomingLike(activity: Like) {
  const remoteActor = await actorFromActivity(activity);
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  if (!remoteActor || !activity.objectId) return;

  const post = await postByUri(activity.objectId.href);
  if (!post) return;
  await db
    .insert(likes)
    .values({ actorId: remoteActor.id, postId: post.id })
    .onConflictDoNothing();
  await createPostAuthorNotification({
    postId: post.id,
    actorId: remoteActor.id,
    actorUserId: remoteActor.userId,
    type: "like",
  });
}

export async function handleIncomingAnnounce(activity: Announce) {
  const remoteActor = await actorFromActivity(activity);
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  if (!remoteActor || !activity.objectId) return;

  const post = await postByUri(activity.objectId.href);
  if (!post) return;
  await db
    .insert(announces)
    .values({ actorId: remoteActor.id, postId: post.id })
    .onConflictDoNothing();
  await createPostAuthorNotification({
    postId: post.id,
    actorId: remoteActor.id,
    actorUserId: remoteActor.userId,
    type: "announce",
  });
}

export async function handleIncomingUndo(ctx: InboxContext<unknown>, activity: Undo) {
  const remoteActor = await actorFromActivity(activity);
  const object = await activity.getObject({
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  if (!remoteActor || !object) return;

  if (object instanceof Follow) {
    const localActorUri = object.objectId?.href;
    const localActor = localActorUri ? await actorByUri(localActorUri) : null;
    if (localActor) {
      await db
        .update(follows)
        .set({ state: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(follows.followerActorId, remoteActor.id),
            eq(follows.followeeActorId, localActor.id),
          ),
        );
    }
    return;
  }

  if (object instanceof Like && object.objectId) {
    const post = await postByUri(object.objectId.href);
    if (post) {
      await db
        .delete(likes)
        .where(and(eq(likes.actorId, remoteActor.id), eq(likes.postId, post.id)));
    }
    return;
  }

  if (object instanceof Announce && object.objectId) {
    const post = await postByUri(object.objectId.href);
    if (post) {
      await db
        .delete(announces)
        .where(and(eq(announces.actorId, remoteActor.id), eq(announces.postId, post.id)));
    }
  }
}

export async function handleIncomingUpdate(ctx: InboxContext<unknown>, activity: Update) {
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  const object = await activity.getObject({
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });
  if (object instanceof Person) {
    const json = await object.toJsonLd({ format: "compact" });
    if (isRecord(json)) await upsertRemoteActorFromJson(json);
  }
}

export async function handleUnverifiedActivity(
  _ctx: RequestContext<unknown>,
  activity: Activity,
  reason: UnverifiedActivityReason,
) {
  await recordIncoming(activity, "unauthorized", {
    activity: await toJson(activity),
    reason,
  });
}

async function handleFollowResponse(
  ctx: InboxContext<unknown>,
  activity: Accept | Reject,
  state: "accepted" | "rejected",
) {
  const rawJson = await toJson(activity);
  await recordIncoming(activity, state, rawJson);
  const remoteActor = await actorFromActivity(activity);
  const object = await activity.getObject({
    documentLoader: ctx.documentLoader,
    suppressError: true,
  });

  if (!remoteActor || !(object instanceof Follow) || !object.actorId) return;
  const localActor = await actorByUri(object.actorId.href);
  if (!localActor) return;

  await db
    .update(follows)
    .set({ state, updatedAt: new Date() })
    .where(
      and(
        eq(follows.followerActorId, localActor.id),
        eq(follows.followeeActorId, remoteActor.id),
      ),
    );
  if (state === "accepted") {
    await enqueueActorTimelineBackfill(remoteActor.id);
  }
}

async function persistRemoteNote(
  remoteActor: typeof actors.$inferSelect,
  note: Note,
  activityJson: unknown,
) {
  if (!note.id) return null;
  const postId = createId("remote_zost");
  const rawJson = await note.toJsonLd({ format: "compact" });
  const contentHtml = sanitizeRemoteHtml(languageText(note.content) ?? "");
  const contentText = contentHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const visibility = remoteNoteHasPublicAudience(rawJson) ? "public" : "direct";

  const [existing] = await db
    .select()
    .from(posts)
    .where(eq(posts.uri, note.id.href))
    .limit(1);

  const post =
    existing ??
    (
      await db
        .insert(posts)
        .values({
          id: postId,
          uri: note.id.href,
          url: linkHref(note.url) ?? note.id.href,
          authorActorId: remoteActor.id,
          contentHtml,
          contentText,
          summary: languageText(note.summary),
          visibility,
          replyToUri: note.replyTargetId?.href,
          sensitive: Boolean(note.sensitive),
          rawJson: activityJson ?? rawJson,
        })
        .returning()
    )[0];

  await persistRemoteAttachments(post.id, note);
  await persistRemoteTagsAndMentions(post.id, note, remoteActor);
  return post;
}

async function persistRemoteTagsAndMentions(
  postId: string,
  note: Note,
  remoteActor: typeof actors.$inferSelect,
) {
  const hashtags = new Map<string, { postId: string; tag: string; href: string | null }>();
  const mentions = new Map<
    string,
    { postId: string; actorId: string | null; handle: string; href: string | null; userId: string | null }
  >();

  for await (const tag of note.getTags({ suppressError: true })) {
    const json = await tag.toJsonLd({ format: "compact" }).catch(() => null);
    if (!isRecord(json)) continue;

    const name = stringValue(json.name);
    const href = stringValue(json.href) ?? stringValue(json.id);
    if (hasType(json.type, "Hashtag")) {
      const normalized = normalizeHashtag(name);
      if (normalized) {
        hashtags.set(normalized, { postId, tag: normalized, href });
      }
      continue;
    }

    if (hasType(json.type, "Mention")) {
      const actor = href ? await actorByUri(href) : null;
      const handle = normalizeMentionHandle(name, actor);
      if (!handle && !href) continue;
      const key = href ?? handle!;
      mentions.set(key, {
        postId,
        actorId: actor?.id ?? null,
        handle: handle ?? href!,
        href,
        userId: actor?.userId ?? null,
      });
    }
  }

  if (hashtags.size) {
    await db.insert(postTags).values(Array.from(hashtags.values())).onConflictDoNothing();
  }

  if (mentions.size) {
    const mentionRows = Array.from(mentions.values());
    await db
      .insert(postMentions)
      .values(
        mentionRows.map((mention) => ({
          postId: mention.postId,
          actorId: mention.actorId,
          handle: mention.handle,
          href: mention.href,
        })),
      )
      .onConflictDoNothing();

    await Promise.all(
      mentionRows.map((mention) =>
        createNotification({
          userId: mention.userId,
          actorId: remoteActor.id,
          actorUserId: remoteActor.userId,
          type: "mention",
          postId,
        }),
      ),
    );
  }
}

async function persistRemoteAttachments(postId: string, note: Note) {
  let index = 0;
  for await (const attachment of note.getAttachments({ suppressError: true })) {
    const json = await attachment.toJsonLd({ format: "compact" });
    if (!isRecord(json)) continue;
    const remoteUrl = stringValue(json.url);
    if (!remoteUrl) continue;

    const [existing] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.remoteUrl, remoteUrl))
      .limit(1);

    const asset =
      existing ??
      (
        await db
          .insert(mediaAssets)
          .values({
            id: createId("remote_media"),
            ownerUserId: null,
            storageKey: remoteUrl,
            remoteUrl,
            mimeType: stringValue(json.mediaType) ?? "application/octet-stream",
            byteSize: 0,
            altText: stringValue(json.name) ?? "",
          })
          .returning()
      )[0];

    await db
      .insert(postMedia)
      .values({ postId, mediaId: asset.id, position: index })
      .onConflictDoNothing();
    index += 1;
  }
}

async function actorFromActivity(activity: Activity) {
  const actorUri = activity.actorId?.href;
  if (!actorUri) return null;

  const existing = await actorByUri(actorUri);
  if (existing) return existing;

  const raw = await fetchJson(actorUri);
  return raw ? upsertRemoteActorFromJson(raw) : null;
}

async function recordIncoming(activity: Activity, status: string, rawJson?: unknown) {
  const actorUri = activity.actorId?.href;
  const activityUri = activity.id?.href ?? `${actorUri ?? "unknown"}#${Date.now()}`;
  const type = activity.constructor.name || "Unknown";

  await db
    .insert(inboxEvents)
    .values({
      id: createId("inbox"),
      actorUri,
      activityType: type,
      activityUri,
      status,
      rawJson,
    })
    .onConflictDoNothing();

  await db
    .insert(activities)
    .values({
      id: createId("activity"),
      uri: activityUri,
      direction: "incoming",
      type,
      actorId: actorUri ? (await actorByUri(actorUri))?.id : null,
      objectUri: activity.objectId?.href,
      targetUri: activity.targetId?.href,
      rawJson,
    })
    .onConflictDoNothing();
}

async function toJson(activity: Activity) {
  return activity.toJsonLd({ format: "compact" }).catch(() => null);
}

async function actorByUri(uri: string) {
  const [actor] = await db.select().from(actors).where(eq(actors.uri, uri)).limit(1);
  return actor ?? null;
}

async function postByUri(uri: string) {
  const [post] = await db.select().from(posts).where(eq(posts.uri, uri)).limit(1);
  return post ?? null;
}

function languageText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    return stringValue((value as Record<string, unknown>).value);
  }
  return null;
}

function linkHref(value: unknown) {
  if (value instanceof URL) return value.href;
  if (value && typeof value === "object" && "href" in value) {
    return stringValue((value as Record<string, unknown>).href);
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasType(value: unknown, typeName: string): boolean {
  if (value === typeName || value === `https://www.w3.org/ns/activitystreams#${typeName}`) return true;
  if (Array.isArray(value)) return value.some((item) => hasType(item, typeName));
  return false;
}

function normalizeHashtag(name: string | null) {
  const tag = name?.replace(/^#/, "").trim().toLowerCase();
  return tag || null;
}

function normalizeMentionHandle(name: string | null, actor: typeof actors.$inferSelect | null) {
  if (name) return name.replace(/^@/, "").trim().toLowerCase() || null;
  if (!actor) return null;
  return actor.type === "remote" ? `${actor.handle}@${actor.domain}` : actor.handle;
}

function remoteNoteHasPublicAudience(rawJson: unknown) {
  if (!isRecord(rawJson)) return false;
  return hasPublicValue(rawJson.to) || hasPublicValue(rawJson.cc);
}

function hasPublicValue(value: unknown): boolean {
  if (value === "https://www.w3.org/ns/activitystreams#Public") return true;
  if (Array.isArray(value)) return value.some(hasPublicValue);
  if (isRecord(value)) return Object.values(value).some(hasPublicValue);
  return false;
}
