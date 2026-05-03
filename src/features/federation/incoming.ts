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
import { and, eq, inArray, or } from "drizzle-orm";
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
  profiles,
} from "@/db/schema";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { sanitizeRemoteHtml } from "@/lib/text";
import { cacheTags } from "@/lib/cache-tags";
import { bumpCacheTags } from "@/lib/cache-version";
import {
  enqueueMentionNotification,
  enqueueFollowNotification,
  enqueuePostAuthorNotification,
} from "@/features/notifications/service";
import {
  enqueueActorTimelineBackfill,
  enqueueTimelineFanout,
} from "@/features/timelines/service";
import { createOutgoingActivity } from "./outgoing";
import { followStateForApprovalPolicy } from "./follow-policy";
import { fetchJson, isDomainBlocked, upsertRemoteActorFromJson } from "./remote";
import { activityStreamsPublic } from "./recipient-policy";
import { federationInboxQueue } from "@/queue";

export async function enqueueIncomingActivity(activity: Activity) {
  const rawJson = await toJson(activity);
  const inboxEvent = await recordIncoming(activity, "queued", rawJson);
  await federationInboxQueue.add("process", { inboxEventId: inboxEvent.id });
}

export async function processInboxEvent(inboxEventId: string) {
  const [event] = await db
    .select()
    .from(inboxEvents)
    .where(eq(inboxEvents.id, inboxEventId))
    .limit(1);

  if (!event) return;

  await db
    .update(inboxEvents)
    .set({ status: "processing", error: null })
    .where(eq(inboxEvents.id, inboxEventId));

  try {
    await processRawIncomingActivity(event.rawJson);
    await db
      .update(inboxEvents)
      .set({ status: "processed", error: null })
      .where(eq(inboxEvents.id, inboxEventId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown inbox processing error.";
    await db
      .update(inboxEvents)
      .set({ status: "failed", error: message })
      .where(eq(inboxEvents.id, inboxEventId));
    throw error;
  }
}

export async function processRawIncomingActivity(rawJson: unknown) {
  if (!isRecord(rawJson)) throw new Error("Inbox event is missing ActivityPub JSON.");

  const type = typeName(rawJson.type);
  const actorUri = objectId(rawJson.actor);
  const activityUri = objectId(rawJson.id) ?? `${actorUri ?? "unknown"}#${Date.now()}`;
  const remoteActor = actorUri ? await actorFromUri(actorUri) : null;

  await upsertIncomingActivityRecord({
    uri: activityUri,
    type,
    actorId: remoteActor?.id ?? null,
    objectUri: objectId(rawJson.object),
    targetUri: objectId(rawJson.target),
    rawJson,
  });

  if (!remoteActor) return;
  if (await isDomainBlocked(remoteActor.domain)) return;

  switch (type) {
    case "Follow":
      await processRawFollow(remoteActor, rawJson, activityUri);
      return;
    case "Accept":
      await processRawFollowResponse(remoteActor, rawJson, "accepted");
      return;
    case "Reject":
      await processRawFollowResponse(remoteActor, rawJson, "rejected");
      return;
    case "Create":
      await processRawCreate(remoteActor, rawJson);
      return;
    case "Delete":
      await processRawDelete(rawJson);
      return;
    case "Like":
      await processRawLike(remoteActor, rawJson);
      return;
    case "Announce":
      await processRawAnnounce(remoteActor, rawJson);
      return;
    case "Undo":
      await processRawUndo(remoteActor, rawJson);
      return;
    case "Update":
      await processRawUpdate(rawJson);
      return;
    default:
      return;
  }
}

export async function handleIncomingFollow(ctx: InboxContext<unknown>, activity: Follow) {
  const remoteActor = await actorFromActivity(activity);
  const localActorUri = activity.objectId?.href;
  const localActor = localActorUri ? await actorByUri(localActorUri) : null;
  const rawJson = await toJson(activity);

  if (!remoteActor || !localActor || localActor.type !== "local") return;
  if (await isDomainBlocked(remoteActor.domain)) return;

  const state = await incomingFollowState(localActor);
  await recordIncoming(activity, state, rawJson);
  await db
    .insert(follows)
    .values({
      followerActorId: remoteActor.id,
      followeeActorId: localActor.id,
      state,
      activityUri: activity.id?.href,
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: {
        state,
        activityUri: activity.id?.href,
        updatedAt: new Date(),
      },
    });
  await enqueueFollowNotification({
    followeeActorId: localActor.id,
    followerActorId: remoteActor.id,
    followerUserId: remoteActor.userId,
  });

  if (state === "accepted") {
    await createOutgoingActivity({
      type: "Accept",
      actorId: localActor.id,
      objectUri: activity.id?.href,
      targetUri: remoteActor.uri,
      rawJson,
    });
  }
  await bumpFollowTags(remoteActor, localActor);
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
  let parent: typeof posts.$inferSelect | null = null;
  if (post.replyToUri) {
    parent = await postByReplyTarget(post.replyToUri);
    if (parent) {
      await enqueuePostAuthorNotification({
        postId: parent.id,
        actorId: remoteActor.id,
        actorUserId: remoteActor.userId,
        type: "reply",
        notificationPostId: post.id,
      });
    }
  }
  await bumpIncomingPostTags(post, remoteActor, parent);
}

export async function handleIncomingDelete(activity: Delete) {
  const rawJson = await toJson(activity);
  await recordIncoming(activity, "received", rawJson);
  const objectUri = activity.objectId?.href;
  if (!objectUri) return;
  const deletedPosts = await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(eq(posts.uri, objectUri))
    .returning();
  await bumpDeletedPostTags(deletedPosts);
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
  await bumpCacheTags([cacheTags.post(post.id)]);
  await enqueuePostAuthorNotification({
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
  await bumpCacheTags([cacheTags.post(post.id), cacheTags.actor(remoteActor.id)]);
  await enqueuePostAuthorNotification({
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
      await bumpFollowTags(remoteActor, localActor);
    }
    return;
  }

  if (object instanceof Like && object.objectId) {
    const post = await postByUri(object.objectId.href);
    if (post) {
      await db
        .delete(likes)
        .where(and(eq(likes.actorId, remoteActor.id), eq(likes.postId, post.id)));
      await bumpCacheTags([cacheTags.post(post.id)]);
    }
    return;
  }

  if (object instanceof Announce && object.objectId) {
    const post = await postByUri(object.objectId.href);
    if (post) {
      await db
        .delete(announces)
        .where(and(eq(announces.actorId, remoteActor.id), eq(announces.postId, post.id)));
      await bumpCacheTags([cacheTags.post(post.id), cacheTags.actor(remoteActor.id)]);
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
    if (isRecord(json)) {
      const actor = await upsertRemoteActorFromJson(json);
      if (actor) await bumpActorTags(actor);
    }
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

  return responseForUnverifiedActivity(reason);
}

export function responseForUnverifiedActivity(reason: UnverifiedActivityReason) {
  if (
    reason.type === "keyFetchError" &&
    "status" in reason.result &&
    reason.result.status === 410
  ) {
    return new Response(null, { status: 202 });
  }
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
  await bumpFollowingTags(remoteActor, localActor);
}

async function processRawFollow(
  remoteActor: typeof actors.$inferSelect,
  rawJson: Record<string, unknown>,
  activityUri: string,
) {
  const localActorUri = objectId(rawJson.object);
  const localActor = localActorUri ? await actorByUri(localActorUri) : null;
  if (!localActor || localActor.type !== "local") return;
  const state = await incomingFollowState(localActor);

  await db
    .insert(follows)
    .values({
      followerActorId: remoteActor.id,
      followeeActorId: localActor.id,
      state,
      activityUri,
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: {
        state,
        activityUri,
        updatedAt: new Date(),
      },
    });

  await enqueueFollowNotification({
    followeeActorId: localActor.id,
    followerActorId: remoteActor.id,
    followerUserId: remoteActor.userId,
  });

  if (state === "accepted") {
    await createOutgoingActivity({
      type: "Accept",
      actorId: localActor.id,
      objectUri: activityUri,
      targetUri: remoteActor.uri,
      rawJson,
    });
  }
  await bumpFollowTags(remoteActor, localActor);
}

async function processRawFollowResponse(
  remoteActor: typeof actors.$inferSelect,
  rawJson: Record<string, unknown>,
  state: "accepted" | "rejected",
) {
  const object = asRecord(rawJson.object);
  const localActorUri = objectId(object?.actor);
  const localActor = localActorUri ? await actorByUri(localActorUri) : null;
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
  await bumpFollowingTags(remoteActor, localActor);
}

async function processRawCreate(remoteActor: typeof actors.$inferSelect, rawJson: Record<string, unknown>) {
  const noteJson = await objectJson(rawJson.object);
  if (!noteJson) return;
  if (typeName(noteJson.type) !== "Note") return;

  const post = await persistRemoteNoteJson(remoteActor, noteJson, rawJson);
  if (!post) return;

  await enqueueTimelineFanout(post.id);
  let parent: typeof posts.$inferSelect | null = null;
  if (post.replyToUri) {
    parent = await postByReplyTarget(post.replyToUri);
    if (parent) {
      await enqueuePostAuthorNotification({
        postId: parent.id,
        actorId: remoteActor.id,
        actorUserId: remoteActor.userId,
        type: "reply",
        notificationPostId: post.id,
      });
    }
  }
  await bumpIncomingPostTags(post, remoteActor, parent);
}

async function processRawDelete(rawJson: Record<string, unknown>) {
  const objectUri = objectId(rawJson.object);
  if (!objectUri) return;
  const deletedPosts = await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(eq(posts.uri, objectUri))
    .returning();
  await bumpDeletedPostTags(deletedPosts);
}

async function processRawLike(remoteActor: typeof actors.$inferSelect, rawJson: Record<string, unknown>) {
  const objectUri = objectId(rawJson.object);
  if (!objectUri) return;

  const post = await postByUri(objectUri);
  if (!post) return;
  const [like] = await db
    .insert(likes)
    .values({ actorId: remoteActor.id, postId: post.id })
    .onConflictDoNothing()
    .returning();

  if (like) {
    await bumpCacheTags([cacheTags.post(post.id)]);
    await enqueuePostAuthorNotification({
      postId: post.id,
      actorId: remoteActor.id,
      actorUserId: remoteActor.userId,
      type: "like",
    });
  }
}

async function processRawAnnounce(remoteActor: typeof actors.$inferSelect, rawJson: Record<string, unknown>) {
  const objectUri = objectId(rawJson.object);
  if (!objectUri) return;

  const post = await postByUri(objectUri);
  if (!post) return;
  const [announce] = await db
    .insert(announces)
    .values({ actorId: remoteActor.id, postId: post.id })
    .onConflictDoNothing()
    .returning();

  if (announce) {
    await bumpCacheTags([cacheTags.post(post.id), cacheTags.actor(remoteActor.id)]);
    await enqueuePostAuthorNotification({
      postId: post.id,
      actorId: remoteActor.id,
      actorUserId: remoteActor.userId,
      type: "announce",
    });
  }
}

async function processRawUndo(remoteActor: typeof actors.$inferSelect, rawJson: Record<string, unknown>) {
  const object = await objectJson(rawJson.object);
  if (!object) return;

  switch (typeName(object.type)) {
    case "Follow": {
      const localActorUri = objectId(object.object);
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
        await bumpFollowTags(remoteActor, localActor);
      }
      return;
    }
    case "Like": {
      const post = await postByUri(objectId(object.object) ?? "");
      if (post) {
        await db
          .delete(likes)
          .where(and(eq(likes.actorId, remoteActor.id), eq(likes.postId, post.id)));
        await bumpCacheTags([cacheTags.post(post.id)]);
      }
      return;
    }
    case "Announce": {
      const post = await postByUri(objectId(object.object) ?? "");
      if (post) {
        await db
          .delete(announces)
          .where(and(eq(announces.actorId, remoteActor.id), eq(announces.postId, post.id)));
        await bumpCacheTags([cacheTags.post(post.id), cacheTags.actor(remoteActor.id)]);
      }
      return;
    }
  }
}

async function processRawUpdate(rawJson: Record<string, unknown>) {
  const object = await objectJson(rawJson.object);
  if (object && isActorType(typeName(object.type))) {
    const actor = await upsertRemoteActorFromJson(object);
    if (actor) await bumpActorTags(actor);
  }
}

async function bumpIncomingPostTags(
  post: typeof posts.$inferSelect,
  remoteActor: typeof actors.$inferSelect,
  parent: typeof posts.$inferSelect | null,
) {
  await bumpCacheTags([
    cacheTags.post(post.id),
    parent ? cacheTags.post(parent.id) : null,
    cacheTags.actor(remoteActor.id),
    cacheTags.nodeInfo,
  ]);
}

async function bumpDeletedPostTags(deletedPosts: Array<typeof posts.$inferSelect>) {
  await bumpCacheTags(
    deletedPosts.flatMap((post) => [
      cacheTags.post(post.id),
      post.replyToPostId ? cacheTags.post(post.replyToPostId) : null,
      cacheTags.nodeInfo,
    ]),
  );
}

async function bumpActorTags(actor: typeof actors.$inferSelect) {
  await bumpCacheTags([
    cacheTags.actor(actor.id),
    actor.type === "local" ? cacheTags.profile(actor.handle) : null,
    actor.type === "local" ? cacheTags.webfinger(actor.handle) : null,
  ]);
}

async function bumpFollowTags(
  remoteActor: typeof actors.$inferSelect,
  localActor: typeof actors.$inferSelect,
) {
  await bumpCacheTags([
    cacheTags.actor(remoteActor.id),
    cacheTags.actor(localActor.id),
    cacheTags.profile(localActor.handle),
    cacheTags.followersCollection(localActor.handle),
  ]);
}

async function bumpFollowingTags(
  remoteActor: typeof actors.$inferSelect,
  localActor: typeof actors.$inferSelect,
) {
  await bumpCacheTags([
    cacheTags.actor(remoteActor.id),
    cacheTags.actor(localActor.id),
    cacheTags.profile(localActor.handle),
    cacheTags.followingCollection(localActor.handle),
  ]);
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
  const visibility = remoteNoteVisibilityFromAudience(rawJson);
  const replyToUri = note.replyTargetId?.href ?? null;
  const replyToPostId = await resolveReplyToPostId(replyToUri);

  const [existing] = await db
    .select()
    .from(posts)
    .where(eq(posts.uri, note.id.href))
    .limit(1);

  const post = existing
    ? await updateRemoteReplyTarget(existing, replyToUri, replyToPostId)
    : (
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
            replyToPostId,
            replyToUri,
            sensitive: Boolean(note.sensitive),
            rawJson: activityJson ?? rawJson,
          })
          .returning()
      )[0];

  await persistRemoteAttachments(post.id, note);
  await persistRemoteTagsAndMentions(post.id, note, remoteActor);
  return post;
}

export async function persistRemoteNoteJson(
  remoteActor: typeof actors.$inferSelect,
  noteJson: Record<string, unknown>,
  activityJson: unknown,
) {
  const noteUri = objectId(noteJson.id);
  if (!noteUri) return null;

  const postId = createId("remote_zost");
  const contentHtml = sanitizeRemoteHtml(languageText(noteJson.content) ?? "");
  const contentText = contentHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const visibility = remoteNoteVisibilityFromAudience(noteJson);
  const replyToUri = objectId(noteJson.inReplyTo) ?? objectId(noteJson.replyTarget);
  const replyToPostId = await resolveReplyToPostId(replyToUri);

  const [existing] = await db
    .select()
    .from(posts)
    .where(eq(posts.uri, noteUri))
    .limit(1);

  const post = existing
    ? await updateRemoteReplyTarget(existing, replyToUri, replyToPostId)
    : (
        await db
          .insert(posts)
          .values({
            id: postId,
            uri: noteUri,
            url: linkHref(noteJson.url) ?? noteUri,
            authorActorId: remoteActor.id,
            contentHtml,
            contentText,
            summary: languageText(noteJson.summary),
            visibility,
            replyToPostId,
            replyToUri,
            sensitive: Boolean(noteJson.sensitive),
            rawJson: activityJson ?? noteJson,
          })
          .returning()
      )[0];

  await persistRemoteAttachmentsJson(post.id, noteJson);
  await persistRemoteTagsAndMentionsJson(post.id, noteJson, remoteActor);
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
        enqueueMentionNotification({
          userId: mention.userId,
          actorId: remoteActor.id,
          actorUserId: remoteActor.userId,
          postId,
        }),
      ),
    );
  }
}

async function persistRemoteTagsAndMentionsJson(
  postId: string,
  noteJson: Record<string, unknown>,
  remoteActor: typeof actors.$inferSelect,
) {
  const hashtags = new Map<string, { postId: string; tag: string; href: string | null }>();
  const mentions = new Map<
    string,
    { postId: string; actorId: string | null; handle: string; href: string | null; userId: string | null }
  >();

  for (const tag of arrayValue(noteJson.tag)) {
    if (!isRecord(tag)) continue;
    const name = stringValue(tag.name);
    const href = stringValue(tag.href) ?? stringValue(tag.id);
    if (hasType(tag.type, "Hashtag")) {
      const normalized = normalizeHashtag(name);
      if (normalized) hashtags.set(normalized, { postId, tag: normalized, href });
      continue;
    }
    if (hasType(tag.type, "Mention")) {
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
        enqueueMentionNotification({
          userId: mention.userId,
          actorId: remoteActor.id,
          actorUserId: remoteActor.userId,
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

async function persistRemoteAttachmentsJson(postId: string, noteJson: Record<string, unknown>) {
  let index = 0;
  for (const attachment of arrayValue(noteJson.attachment)) {
    if (!isRecord(attachment)) continue;
    const remoteUrl = stringValue(attachment.url);
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
            mimeType: stringValue(attachment.mediaType) ?? "application/octet-stream",
            byteSize: 0,
            altText: stringValue(attachment.name) ?? "",
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

  return actorFromUri(actorUri);
}

async function recordIncoming(activity: Activity, status: string, rawJson?: unknown) {
  const actorUri = activity.actorId?.href;
  const activityUri = activity.id?.href ?? `${actorUri ?? "unknown"}#${Date.now()}`;
  const type = activity.constructor.name || "Unknown";

  const [event] = await db
    .insert(inboxEvents)
    .values({
      id: createId("inbox"),
      actorUri,
      activityType: type,
      activityUri,
      status,
      rawJson,
    })
    .returning();

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

  return event;
}

async function upsertIncomingActivityRecord(input: {
  uri: string;
  type: string;
  actorId: string | null;
  objectUri: string | null;
  targetUri: string | null;
  rawJson: unknown;
}) {
  await db
    .insert(activities)
    .values({
      id: createId("activity"),
      uri: input.uri,
      direction: "incoming",
      type: input.type,
      actorId: input.actorId,
      objectUri: input.objectUri,
      targetUri: input.targetUri,
      rawJson: input.rawJson,
    })
    .onConflictDoUpdate({
      target: activities.uri,
      set: {
        actorId: input.actorId,
        objectUri: input.objectUri,
        targetUri: input.targetUri,
        rawJson: input.rawJson,
      },
    });
}

async function actorFromUri(actorUri: string) {
  const existing = await actorByUri(actorUri);
  if (existing) return existing;

  const raw = await fetchJson(actorUri);
  return raw ? upsertRemoteActorFromJson(raw) : null;
}

async function objectJson(value: unknown) {
  const record = asRecord(value);
  if (record) return record;
  const uri = objectId(value);
  return uri ? fetchJson(uri) : null;
}

async function toJson(activity: Activity) {
  return activity.toJsonLd({ format: "compact" }).catch(() => null);
}

async function actorByUri(uri: string) {
  const [actor] = await db.select().from(actors).where(eq(actors.uri, uri)).limit(1);
  return actor ?? null;
}

async function incomingFollowState(localActor: typeof actors.$inferSelect) {
  if (!localActor.userId) return "accepted";

  const [profile] = await db
    .select({ manuallyApprovesFollowers: profiles.manuallyApprovesFollowers })
    .from(profiles)
    .where(eq(profiles.userId, localActor.userId))
    .limit(1);

  return followStateForApprovalPolicy(Boolean(profile?.manuallyApprovesFollowers));
}

async function postByUri(uri: string) {
  const [post] = await db.select().from(posts).where(eq(posts.uri, uri)).limit(1);
  return post ?? null;
}

async function postByReplyTarget(replyToUri: string) {
  const targets = postLookupTargetsForReply(replyToUri);
  const [post] = await db
    .select()
    .from(posts)
    .where(or(inArray(posts.uri, targets), inArray(posts.url, targets)))
    .limit(1);

  return post ?? null;
}

async function resolveReplyToPostId(replyToUri: string | null) {
  if (!replyToUri) return null;

  const parent = await postByReplyTarget(replyToUri);
  return parent?.id ?? null;
}

async function updateRemoteReplyTarget(
  post: typeof posts.$inferSelect,
  replyToUri: string | null,
  replyToPostId: string | null,
) {
  if ((!replyToUri || post.replyToUri) && (!replyToPostId || post.replyToPostId)) {
    return post;
  }

  const [updated] = await db
    .update(posts)
    .set({
      replyToUri: post.replyToUri ?? replyToUri,
      replyToPostId: post.replyToPostId ?? replyToPostId,
    })
    .where(eq(posts.id, post.id))
    .returning();

  return updated ?? post;
}

export function postLookupTargetsForReply(replyToUri: string, origin = env.APP_ORIGIN) {
  const targets = new Set([replyToUri]);

  try {
    const parsed = new URL(replyToUri);
    const localOrigin = new URL(origin).origin;
    if (parsed.origin !== localOrigin) return Array.from(targets);

    const segments = parsed.pathname.split("/").filter(Boolean);
    const postId = segments[0] === "objects" ? segments[1] : segments[0]?.startsWith("@") ? segments[1] : null;
    if (postId) targets.add(`${localOrigin}/objects/${postId}`);
  } catch {
    return Array.from(targets);
  }

  return Array.from(targets);
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

function objectId(value: unknown) {
  if (value instanceof URL) return value.href;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) return stringValue(value.id) ?? stringValue(value.href);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function typeName(value: unknown): string {
  if (typeof value === "string") return compactTypeName(value);
  if (Array.isArray(value)) {
    const type = value.map(typeName).find((item) => item !== "Unknown");
    return type ?? "Unknown";
  }
  return "Unknown";
}

function compactTypeName(type: string) {
  const value = type.trim();
  const separator = Math.max(value.lastIndexOf("#"), value.lastIndexOf("/"));
  return separator >= 0 ? value.slice(separator + 1) : value;
}

function hasType(value: unknown, typeName: string): boolean {
  if (value === typeName || value === `https://www.w3.org/ns/activitystreams#${typeName}`) return true;
  if (Array.isArray(value)) return value.some((item) => hasType(item, typeName));
  return false;
}

function isActorType(type: string) {
  return (
    type === "Person" ||
    type === "Service" ||
    type === "Application" ||
    type === "Group" ||
    type === "Organization"
  );
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

export function remoteNoteVisibilityFromAudience(rawJson: unknown) {
  if (!isRecord(rawJson)) return "direct";
  if (hasPublicValue(rawJson.to)) return "public";
  if (hasPublicValue(rawJson.cc)) return "unlisted";
  if (hasFollowersAudience(rawJson.to) || hasFollowersAudience(rawJson.cc)) {
    return "followers";
  }
  return "direct";
}

function hasPublicValue(value: unknown): boolean {
  if (value === activityStreamsPublic) return true;
  if (Array.isArray(value)) return value.some(hasPublicValue);
  if (isRecord(value)) return Object.values(value).some(hasPublicValue);
  return false;
}

function hasFollowersAudience(value: unknown): boolean {
  if (typeof value === "string") return /\/followers\/?$/.test(value);
  if (Array.isArray(value)) return value.some(hasFollowersAudience);
  if (isRecord(value)) return Object.values(value).some(hasFollowersAudience);
  return false;
}
