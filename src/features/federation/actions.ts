"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actors, follows } from "@/db/schema";
import { ensureLocalActor } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOutgoingActivity } from "./outgoing";
import { lookupRemoteActor } from "./remote";

export async function searchRemoteActorAction(formData: FormData) {
  const { session } = await requireUser();
  const rateLimit = checkRateLimit(`remote-search:${session.user.id}`, {
    limit: 60,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.ok) throw new Error("Too many remote searches. Try again later.");

  const query = String(formData.get("q") ?? "").trim();
  if (!query) return null;
  return lookupRemoteActor(query);
}

export async function followActorAction(formData: FormData) {
  const { session } = await requireUser();
  const actorUri = String(formData.get("actorUri") ?? "").trim();
  if (!actorUri) throw new Error("Remote actor URI is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const remoteActor = await findRemoteActor(actorUri);
  if (!remoteActor) throw new Error("Remote actor was not found.");

  await db
    .insert(follows)
    .values({
      followerActorId: localActor.id,
      followeeActorId: remoteActor.id,
      state: "pending",
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: { state: "pending", updatedAt: new Date() },
    });

  await createOutgoingActivity({
    type: "Follow",
    actorId: localActor.id,
    targetUri: remoteActor.uri,
  });

  revalidatePath("/search");
}

export async function unfollowActorAction(formData: FormData) {
  const { session } = await requireUser();
  const actorUri = String(formData.get("actorUri") ?? "").trim();
  if (!actorUri) throw new Error("Remote actor URI is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const remoteActor = await findRemoteActor(actorUri);
  if (!remoteActor) throw new Error("Remote actor was not found.");

  await db
    .update(follows)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(follows.followerActorId, localActor.id),
        eq(follows.followeeActorId, remoteActor.id),
      ),
    );

  await createOutgoingActivity({
    type: "Undo",
    actorId: localActor.id,
    objectUri: remoteActor.uri,
    targetUri: remoteActor.uri,
  });

  revalidatePath("/search");
}

async function findRemoteActor(actorUri: string) {
  const [existing] = await db.select().from(actors).where(eq(actors.uri, actorUri)).limit(1);
  if (existing) return existing;
  return (await lookupRemoteActor(actorUri))?.actor ?? null;
}
