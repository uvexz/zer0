import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actors, mediaAssets, postMedia, posts, profiles } from "@/db/schema";
import { mediaDisplayUrl } from "@/features/media/service";
import { env } from "@/lib/env";
import { createNoteAudience } from "./recipient-policy";

export const activityJsonHeaders = {
  "content-type": "application/activity+json; charset=utf-8",
};

export async function actorJson(username: string) {
  const [row] = await db
    .select({ profile: profiles, actor: actors })
    .from(profiles)
    .innerJoin(actors, eq(actors.userId, profiles.userId))
    .where(eq(profiles.username, username))
    .limit(1);

  if (!row) return null;
  const id = `${env.APP_ORIGIN}/users/${row.profile.username}`;

  return {
    "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
    id,
    type: "Person",
    preferredUsername: row.profile.username,
    name: row.profile.displayName,
    summary: row.profile.bio,
    icon: row.profile.avatarUrl
      ? {
          type: "Image",
          mediaType: "image/*",
          url: new URL(row.profile.avatarUrl, env.APP_ORIGIN).href,
        }
      : undefined,
    image: row.profile.headerUrl
      ? {
          type: "Image",
          mediaType: "image/*",
          url: new URL(row.profile.headerUrl, env.APP_ORIGIN).href,
        }
      : undefined,
    inbox: `${id}/inbox`,
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    url: `${env.APP_ORIGIN}/@${row.profile.username}`,
    discoverable: true,
    publicKey: row.actor.publicKeyPem
      ? {
          id: `${id}#main-key`,
          owner: id,
          publicKeyPem: row.actor.publicKeyPem,
        }
      : undefined,
  };
}

export async function noteJson(id: string) {
  const [row] = await db
    .select({ post: posts, profile: profiles, actor: actors })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .innerJoin(profiles, eq(profiles.userId, actors.userId))
    .where(eq(posts.id, id))
    .limit(1);

  if (!row || row.post.deletedAt || row.post.hiddenAt) return null;
  if (row.post.visibility !== "public" && row.post.visibility !== "unlisted") return null;

  const media = await db
    .select({ media: mediaAssets })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
    .where(eq(postMedia.postId, id));
  const audience = createNoteAudience({
    visibility: row.post.visibility,
    followersUrl: row.actor.followersUrl,
  });

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: row.post.uri,
    type: "Note",
    attributedTo: row.actor.uri,
    content: row.post.contentHtml,
    published: row.post.publishedAt.toISOString(),
    to: audience.tos.map((url) => url.href),
    cc: audience.ccs.map((url) => url.href),
    url: row.post.url,
    attachment: media.map(({ media }) => ({
      type: "Document",
      mediaType: media.mimeType,
      url: new URL(
        mediaDisplayUrl({
          mediaId: media.id,
          storageKey: media.storageKey,
          variant: "original",
        }),
        env.APP_ORIGIN,
      ).href,
      name: media.altText,
    })),
  };
}
