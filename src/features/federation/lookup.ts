import { posts } from "@/db/schema";
import { persistRemoteNoteJson } from "./incoming";
import { fetchJson, upsertRemoteActorFromJson } from "./remote";

export type RemotePostLookup = {
  post: typeof posts.$inferSelect;
  raw: Record<string, unknown>;
};

export async function lookupRemotePost(url: string): Promise<RemotePostLookup | null> {
  if (!isHttpUrl(url)) return null;

  const raw = await fetchJson(url);
  if (!raw) return null;

  const noteJson = await noteJsonFromLookupDocument(raw);
  if (!noteJson) return null;

  const actorJson = await actorJsonForRemoteNote(noteJson, raw);
  if (!actorJson) return null;

  const actor = await upsertRemoteActorFromJson(actorJson);
  if (!actor || actor.blockedAt) return null;

  const post = await persistRemoteNoteJson(actor, noteJson, raw);
  return post ? { post, raw } : null;
}

export function isRemotePostLookupDocument(raw: unknown) {
  return Boolean(noteJsonFromRawLookupDocument(raw));
}

export function noteJsonFromRawLookupDocument(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (hasType(raw.type, "Note")) return raw;
  if (!hasType(raw.type, "Create")) return null;

  const object = raw.object;
  return isRecord(object) && hasType(object.type, "Note") ? object : null;
}

export function remoteNoteActorId(noteJson: Record<string, unknown>, activityJson?: Record<string, unknown>) {
  return objectId(noteJson.attributedTo) ?? objectId(activityJson?.actor);
}

async function noteJsonFromLookupDocument(raw: Record<string, unknown>) {
  const embedded = noteJsonFromRawLookupDocument(raw);
  if (embedded) return embedded;

  if (!hasType(raw.type, "Create")) return null;
  const objectUri = objectId(raw.object);
  if (!objectUri) return null;

  const objectJson = await fetchJson(objectUri);
  return noteJsonFromRawLookupDocument(objectJson);
}

async function actorJsonForRemoteNote(noteJson: Record<string, unknown>, activityJson: Record<string, unknown>) {
  const embeddedActor = recordValue(noteJson.attributedTo) ?? recordValue(activityJson.actor);
  if (embeddedActor) return embeddedActor;

  const actorUri = remoteNoteActorId(noteJson, activityJson);
  return actorUri ? fetchJson(actorUri) : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function objectId(value: unknown) {
  if (value instanceof URL) return value.href;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) return stringValue(value.id) ?? stringValue(value.href);
  return null;
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasType(value: unknown, typeName: string): boolean {
  if (value === typeName || value === `https://www.w3.org/ns/activitystreams#${typeName}`) return true;
  if (Array.isArray(value)) return value.some((item) => hasType(item, typeName));
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
