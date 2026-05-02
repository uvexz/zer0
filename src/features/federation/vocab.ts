import {
  Accept,
  Announce,
  Create,
  Delete,
  Document,
  Follow,
  Hashtag,
  Like,
  Mention,
  Note,
  Person,
  Reject,
  Undo,
  Update,
  type Recipient,
} from "@fedify/fedify/vocab";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  actors,
  mediaAssets,
  postMedia,
  postMentions,
  postRecipients,
  postTags,
  posts,
  profiles,
} from "@/db/schema";
import { env } from "@/lib/env";
import { mediaDisplayUrl } from "@/features/media/service";
import { ensureActorKeyPair } from "./keys";
import { profileImage } from "./profile-image";
import { activityStreamsPublic, createNoteAudience } from "./recipient-policy";
import { actorFederationSettings } from "./actor-settings";

export const publicCollection = new URL(activityStreamsPublic);

export async function buildPerson(username: string) {
  const [row] = await db
    .select({ profile: profiles, actor: actors })
    .from(profiles)
    .innerJoin(actors, eq(actors.userId, profiles.userId))
    .where(eq(profiles.username, username))
    .limit(1);

  if (!row || row.profile.disabledAt || row.actor.blockedAt) return null;

  const actorUri = new URL(row.actor.uri);
  const keyPair = await ensureActorKeyPair(row.actor);
  const settings = actorFederationSettings(row.profile);

  return new Person({
    id: actorUri,
    preferredUsername: row.profile.username,
    name: row.profile.displayName,
    summary: row.profile.bio,
    icon: profileImage(row.profile.avatarUrl),
    image: profileImage(row.profile.headerUrl),
    inbox: new URL(`${row.actor.uri}/inbox`),
    outbox: new URL(`${row.actor.uri}/outbox`),
    followers: new URL(`${row.actor.uri}/followers`),
    following: new URL(`${row.actor.uri}/following`),
    liked: new URL(`${row.actor.uri}/liked`),
    url: new URL(`${env.APP_ORIGIN}/@${row.profile.username}`),
    discoverable: settings.discoverable,
    manuallyApprovesFollowers: settings.manuallyApprovesFollowers,
    publicKey: keyPair.cryptographicKey,
  });
}

export async function buildNote(postId: string) {
  const [row] = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row || row.post.deletedAt || row.post.hiddenAt) return null;
  if (row.actor.blockedAt || row.profile?.disabledAt) return null;

  const media = await db
    .select({ media: mediaAssets })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
    .where(eq(postMedia.postId, postId));

  const recipientUris = await noteRecipientUris(row.post);
  const audience = createNoteAudience({
    visibility: row.post.visibility,
    followersUrl: row.actor.followersUrl,
    recipientUris,
  });
  const tags = await noteTags(postId);

  return new Note({
    id: new URL(row.post.uri),
    attribution: new URL(row.actor.uri),
    content: row.post.contentHtml,
    summary: row.post.summary,
    sensitive: row.post.sensitive,
    url: new URL(row.post.url),
    replyTarget: row.post.replyToUri ? new URL(row.post.replyToUri) : null,
    tos: audience.tos,
    ccs: audience.ccs,
    tags,
    attachments: media.map(({ media }) =>
      new Document({
        mediaType: media.mimeType,
        url: new URL(mediaDisplayUrl({
          mediaId: media.id,
          storageKey: media.storageKey,
          variant: "original",
        }), env.APP_ORIGIN),
        name: media.altText,
      })
    ),
  });
}

export async function buildActivity(record: typeof activities.$inferSelect) {
  const actorUri = record.actorId ? await getActorUri(record.actorId) : null;
  const activityUri = new URL(record.uri);
  const object = await buildActivityObject(record);

  switch (record.type) {
    case "Create":
      return new Create({
        id: activityUri,
        actor: actorUri,
        object,
        ...(await buildCreateActivityAudience(record)),
      });
    case "Delete":
      return new Delete({
        id: activityUri,
        actor: actorUri,
        object: object ?? (record.objectUri ? new URL(record.objectUri) : null),
      });
    case "Like":
      return new Like({
        id: activityUri,
        actor: actorUri,
        object: record.objectUri ? new URL(record.objectUri) : null,
      });
    case "Announce":
      return new Announce({
        id: activityUri,
        actor: actorUri,
        object: record.objectUri ? new URL(record.objectUri) : null,
        tos: [publicCollection],
      });
    case "Follow":
      return new Follow({
        id: activityUri,
        actor: actorUri,
        object: record.targetUri ? new URL(record.targetUri) : null,
      });
    case "Accept":
      return new Accept({
        id: activityUri,
        actor: actorUri,
        object: record.objectUri ? new URL(record.objectUri) : null,
      });
    case "Reject":
      return new Reject({
        id: activityUri,
        actor: actorUri,
        object: record.objectUri ? new URL(record.objectUri) : null,
      });
    case "Undo":
      return new Undo({
        id: activityUri,
        actor: actorUri,
        object: record.objectUri ? new URL(record.objectUri) : null,
      });
    case "Update":
      return new Update({
        id: activityUri,
        actor: actorUri,
        object,
      });
    default:
      return null;
  }
}

export function asRecipients(actorRows: Array<typeof actors.$inferSelect>): Recipient[] {
  return actorRows
    .filter((actor) => actor.inboxUrl)
    .map((actor) => ({
      id: new URL(actor.uri),
      inboxId: new URL(actor.inboxUrl!),
      endpoints: actor.sharedInboxUrl
        ? { sharedInbox: new URL(actor.sharedInboxUrl) }
        : null,
    }) as Recipient);
}

async function buildActivityObject(record: typeof activities.$inferSelect) {
  if (!record.objectUri) return null;
  const postId = record.objectUri.startsWith(`${env.APP_ORIGIN}/objects/`)
    ? record.objectUri.slice(`${env.APP_ORIGIN}/objects/`.length)
    : null;

  if (postId) return buildNote(postId);
  return new URL(record.objectUri);
}

async function buildCreateActivityAudience(record: typeof activities.$inferSelect) {
  if (!record.objectUri) return { tos: [publicCollection] };
  const postId = record.objectUri.startsWith(`${env.APP_ORIGIN}/objects/`)
    ? record.objectUri.slice(`${env.APP_ORIGIN}/objects/`.length)
    : null;
  if (!postId) return { tos: [publicCollection] };

  const [row] = await db
    .select({ post: posts, actor: actors })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!row) return { tos: [publicCollection] };

  return createNoteAudience({
    visibility: row.post.visibility,
    followersUrl: row.actor.followersUrl,
    recipientUris: await noteRecipientUris(row.post),
  });
}

async function getActorUri(actorId: string) {
  const [actor] = await db.select().from(actors).where(eq(actors.id, actorId)).limit(1);
  return actor ? new URL(actor.uri) : null;
}

async function noteRecipientUris(post: typeof posts.$inferSelect) {
  const rows =
    post.visibility === "direct"
      ? await db
          .select({ uri: actors.uri })
          .from(postRecipients)
          .innerJoin(actors, eq(actors.id, postRecipients.actorId))
          .where(eq(postRecipients.postId, post.id))
      : await db
          .select({ uri: actors.uri })
          .from(postMentions)
          .innerJoin(actors, eq(actors.id, postMentions.actorId))
          .where(eq(postMentions.postId, post.id));

  return Array.from(new Set(rows.map((row) => row.uri)));
}

async function noteTags(postId: string) {
  const [hashtags, mentions] = await Promise.all([
    db.select().from(postTags).where(eq(postTags.postId, postId)),
    db
      .select({ mention: postMentions, actor: actors })
      .from(postMentions)
      .leftJoin(actors, eq(actors.id, postMentions.actorId))
      .where(eq(postMentions.postId, postId)),
  ]);

  return [
    ...hashtags.map(
      (tag) =>
        new Hashtag({
          href: new URL(tag.href ?? `${env.APP_ORIGIN}/search?q=${encodeURIComponent(`#${tag.tag}`)}`),
          name: `#${tag.tag}`,
        }),
    ),
    ...mentions
      .map(({ mention, actor }) => {
        const href = mention.href ?? actor?.uri;
        if (!href) return null;
        const name = mention.handle.startsWith("@") ? mention.handle : `@${mention.handle}`;
        return new Mention({ href: new URL(href), name });
      })
      .filter((mention): mention is Mention => Boolean(mention)),
  ];
}
