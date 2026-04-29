import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actors, domainBlocks, posts } from "@/db/schema";
import { createId } from "@/lib/id";
import { sanitizeRemoteHtml } from "@/lib/text";

const actorContentTypes = [
  "application/activity+json",
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  "application/ld+json",
];

export type RemoteActorLookup = {
  actor: typeof actors.$inferSelect;
  raw: Record<string, unknown>;
};

export async function lookupRemoteActor(query: string): Promise<RemoteActorLookup | null> {
  const actorUrl = query.startsWith("http://") || query.startsWith("https://")
    ? query
    : await webfingerActorUrl(query);

  if (!actorUrl) return null;
  const raw = await fetchJson(actorUrl);
  if (!raw || typeof raw.id !== "string") return null;
  const actor = await upsertRemoteActorFromJson(raw);
  return actor ? { actor, raw } : null;
}

export async function refreshRemoteResource(
  resource: string,
  kind: "actor" | "object" | "webfinger" = "object",
) {
  if (kind === "webfinger" || resource.startsWith("@") || resource.startsWith("acct:")) {
    return lookupRemoteActor(resource.replace(/^acct:/, ""));
  }

  const raw = await fetchJson(resource);
  if (!raw) return null;

  const type = Array.isArray(raw.type) ? raw.type[0] : raw.type;
  if (kind === "actor" || isActorType(type)) {
    return upsertRemoteActorFromJson(raw);
  }

  if (typeof raw.id === "string") {
    const [existing] = await db.select().from(posts).where(eq(posts.uri, raw.id)).limit(1);
    if (existing) {
      await db.update(posts).set({ rawJson: raw }).where(eq(posts.id, existing.id));
    }
  }

  return raw;
}

export async function upsertRemoteActorFromJson(raw: Record<string, unknown>) {
  const uri = stringValue(raw.id);
  const inboxUrl = stringValue(raw.inbox);
  if (!uri || !inboxUrl) return null;

  const url = new URL(uri);
  if (isBlockedHost(url.hostname) || (await isDomainBlocked(url.hostname))) return null;

  const preferredUsername =
    stringValue(raw.preferredUsername) ?? url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
  const handle = preferredUsername.replace(/^@/, "");
  const sharedInboxUrl = sharedInbox(raw);
  const [actor] = await db
    .insert(actors)
    .values({
      id: createId("actor"),
      type: "remote",
      handle,
      domain: url.hostname,
      uri,
      inboxUrl,
      sharedInboxUrl,
      outboxUrl: stringValue(raw.outbox),
      followersUrl: stringValue(raw.followers),
      followingUrl: stringValue(raw.following),
      preferredUsername,
      name: stringValue(raw.name),
      summary: sanitizeRemoteHtml(stringValue(raw.summary) ?? ""),
      avatarUrl: iconUrl(raw),
      rawJson: raw,
      lastFetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: actors.uri,
      set: {
        inboxUrl,
        sharedInboxUrl,
        outboxUrl: stringValue(raw.outbox),
        followersUrl: stringValue(raw.followers),
        followingUrl: stringValue(raw.following),
        preferredUsername,
        name: stringValue(raw.name),
        summary: sanitizeRemoteHtml(stringValue(raw.summary) ?? ""),
        avatarUrl: iconUrl(raw),
        rawJson: raw,
        lastFetchedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return actor;
}

export async function isDomainBlocked(hostname: string) {
  const [block] = await db
    .select()
    .from(domainBlocks)
    .where(eq(domainBlocks.domain, hostname.toLowerCase()))
    .limit(1);
  return Boolean(block);
}

export function isPrivateOrLocalHost(hostname: string) {
  return isBlockedHost(hostname);
}

export async function fetchJson(url: string) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) return null;
  if (isBlockedHost(target.hostname) || (await isDomainBlocked(target.hostname))) return null;

  const response = await fetch(target, {
    headers: {
      accept: actorContentTypes.join(", "),
      "user-agent": "Zer0/0.1 ActivityPub",
    },
    redirect: "follow",
  });
  if (!response.ok) return null;

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1024 * 1024) return null;

  const text = await response.text();
  if (text.length > 1024 * 1024) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function webfingerActorUrl(query: string) {
  const normalized = query.trim().replace(/^@/, "");
  const [username, host] = normalized.split("@");
  if (!username || !host || isBlockedHost(host) || (await isDomainBlocked(host))) return null;

  const webfingerUrl = new URL(`https://${host}/.well-known/webfinger`);
  webfingerUrl.searchParams.set("resource", `acct:${username}@${host}`);
  const descriptor = await fetchJson(webfingerUrl.href);
  const links = Array.isArray(descriptor?.links) ? descriptor.links : [];
  const self = links.find((link) => {
    if (!link || typeof link !== "object") return false;
    const record = link as Record<string, unknown>;
    return record.rel === "self" && typeof record.href === "string";
  }) as Record<string, unknown> | undefined;

  return stringValue(self?.href);
}

function sharedInbox(raw: Record<string, unknown>) {
  const endpoints = raw.endpoints;
  if (!endpoints || typeof endpoints !== "object") return null;
  return stringValue((endpoints as Record<string, unknown>).sharedInbox);
}

function iconUrl(raw: Record<string, unknown>) {
  const icon = raw.icon;
  if (!icon || typeof icon !== "object") return null;
  return stringValue((icon as Record<string, unknown>).url);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActorType(type: unknown) {
  return (
    type === "Person" ||
    type === "Service" ||
    type === "Application" ||
    type === "Group" ||
    type === "Organization"
  );
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
