import { count, desc, eq, and } from "drizzle-orm";
import {
  createFederation,
  MemoryKvStore,
  type NodeInfo,
  type PageItems,
} from "@fedify/fedify";
import {
  Accept,
  Announce,
  Create,
  Delete,
  Follow,
  Like,
  Note,
  Reject,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import { db } from "@/db";
import { actors, follows, likes, posts, profiles } from "@/db/schema";
import { env } from "@/lib/env";
import { cacheTags } from "@/lib/cache-tags";
import { cachedRead } from "@/lib/cached-read";
import { checkRateLimit, clientAddress, rateLimitHeaders } from "@/lib/rate-limit";
import { ensureActorKeyPair } from "./keys";
import { enqueueIncomingActivity, handleUnverifiedActivity } from "./incoming";
import { cachedFederationGet } from "./response-cache";
import { asRecipients, buildNote, buildPerson, publicCollection } from "./vocab";

export const federation = createFederation<unknown>({
  kv: new MemoryKvStore(),
  origin: env.APP_ORIGIN,
  manuallyStartQueue: true,
  firstKnock: "draft-cavage-http-signatures-12",
});

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async () => {
  return cachedRead({
    key: "nodeinfo",
    tags: [cacheTags.nodeInfo],
    load: readNodeInfo,
  });
});

async function readNodeInfo() {
  const [users] = await db.select({ count: count() }).from(profiles);
  const [zosts] = await db.select({ count: count() }).from(posts);

  return {
    software: { name: "zer0", version: "0.1.0" },
    protocols: ["activitypub"],
    services: { inbound: [], outbound: [] },
    openRegistrations: false,
    usage: {
      users: { total: Number(users.count) },
      localPosts: Number(zosts.count),
      localComments: 0,
    },
    metadata: {},
  } satisfies NodeInfo;
}

federation
  .setActorDispatcher("/users/{identifier}", async (_ctx, identifier) => {
    return buildPerson(identifier);
  })
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    const actor = await localActorForUsername(identifier);
    if (!actor) return [];
    const keyPair = await ensureActorKeyPair(actor);
    return [keyPair];
  })
  .mapHandle(async (_ctx, username) => {
    return (await localActorForUsername(username)) ? username : null;
  })
  .mapAlias(async (_ctx, resource) => {
    const host = new URL(env.APP_ORIGIN).host;
    if (resource.protocol === "acct:") {
      const [username, queryHost] = resource.pathname.split("@");
      return queryHost === host && (await localActorForUsername(username))
        ? { identifier: username }
        : null;
    }
    if (resource.href.startsWith(`${env.APP_ORIGIN}/@`)) {
      const username = resource.pathname.slice(2);
      return (await localActorForUsername(username)) ? { identifier: username } : null;
    }
    return null;
  });

federation.setObjectDispatcher(Note, "/objects/{id}", async (_ctx, { id }) => {
  return buildNote(id);
});

federation.setOutboxDispatcher("/users/{identifier}/outbox", async (_ctx, identifier) => {
  const actor = await localActorForUsername(identifier);
  if (!actor) return null;

  const rows = await db
    .select({ post: posts })
    .from(posts)
    .where(and(eq(posts.authorActorId, actor.id), eq(posts.visibility, "public")))
    .orderBy(desc(posts.publishedAt))
    .limit(20);

  const items = [];
  for (const { post } of rows) {
    const note = await buildNote(post.id);
    if (!note) continue;
    items.push(new Create({
      id: new URL(`${post.uri}#create`),
      actor: new URL(actor.uri),
      object: note,
      tos: [publicCollection],
    }));
  }

  return collection(items);
});

federation.setFollowersDispatcher("/users/{identifier}/followers", async (_ctx, identifier) => {
  const actor = await localActorForUsername(identifier);
  if (!actor) return null;

  const rows = await db
    .select({ actor: actors })
    .from(follows)
    .innerJoin(actors, eq(actors.id, follows.followerActorId))
    .where(and(eq(follows.followeeActorId, actor.id), eq(follows.state, "accepted")));

  return collection(asRecipients(rows.map(({ actor }) => actor)));
});

federation.setFollowingDispatcher("/users/{identifier}/following", async (_ctx, identifier) => {
  const actor = await localActorForUsername(identifier);
  if (!actor) return null;

  const rows = await db
    .select({ actor: actors })
    .from(follows)
    .innerJoin(actors, eq(actors.id, follows.followeeActorId))
    .where(and(eq(follows.followerActorId, actor.id), eq(follows.state, "accepted")));

  return collection(rows.map(({ actor }) => new URL(actor.uri)));
});

federation.setLikedDispatcher("/users/{identifier}/liked", async (_ctx, identifier) => {
  const actor = await localActorForUsername(identifier);
  if (!actor) return null;

  const rows = await db
    .select({ post: posts })
    .from(likes)
    .innerJoin(posts, eq(posts.id, likes.postId))
    .where(eq(likes.actorId, actor.id));

  return collection(rows.map(({ post }) => new URL(post.uri)));
});

federation
  .setInboxListeners("/users/{identifier}/inbox", "/inbox")
  .on(Follow, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Create, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Delete, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Like, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Announce, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Undo, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Update, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Accept, (_ctx, activity) => enqueueIncomingActivity(activity))
  .on(Reject, (_ctx, activity) => enqueueIncomingActivity(activity))
  .onUnverifiedActivity(handleUnverifiedActivity)
  .withIdempotency("global");

export function federationFetch(request: Request) {
  if (request.method === "POST") {
    return cappedFederationFetch(request);
  }

  return cachedFederationGet(request, () => federation.fetch(request, { contextData: undefined }));
}

async function cappedFederationFetch(request: Request) {
  const rateLimit = await checkRateLimit(`inbox:${clientAddress(request)}`, {
    limit: 300,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.ok) {
    return new Response("Too many inbox requests.", {
      status: 429,
      headers: rateLimitHeaders(rateLimit),
    });
  }

  const maxInboxBytes = 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxInboxBytes) {
    return new Response("Activity payload is too large.", { status: 413 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > maxInboxBytes) {
    return new Response("Activity payload is too large.", { status: 413 });
  }

  return federation.fetch(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }),
    { contextData: undefined },
  );
}

async function localActorForUsername(username: string) {
  const [row] = await db
    .select({ actor: actors })
    .from(profiles)
    .innerJoin(actors, eq(actors.userId, profiles.userId))
    .where(eq(profiles.username, username))
    .limit(1);

  return row?.actor ?? null;
}

function collection<T>(items: readonly T[]): PageItems<T> {
  return { items, nextCursor: null, prevCursor: null };
}
