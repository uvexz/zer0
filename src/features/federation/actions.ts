"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actors, follows } from "@/db/schema";
import { ensureLocalActor } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { enqueueFollowNotification } from "@/features/notifications/service";
import { enqueueActorTimelineBackfill } from "@/features/timelines/service";
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
  const targetActor = await findActor(actorUri);
  if (!targetActor) throw new Error("Actor was not found.");
  if (targetActor.id === localActor.id) throw new Error("You cannot follow yourself.");

  await db
    .insert(follows)
    .values({
      followerActorId: localActor.id,
      followeeActorId: targetActor.id,
      state: targetActor.type === "local" ? "accepted" : "pending",
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: {
        state: targetActor.type === "local" ? "accepted" : "pending",
        updatedAt: new Date(),
      },
    });

  if (targetActor.type === "remote") {
    const activity = await createOutgoingActivity({
      type: "Follow",
      actorId: localActor.id,
      targetUri: targetActor.uri,
    });
    await db
      .update(follows)
      .set({ activityUri: activity.uri, updatedAt: new Date() })
      .where(
        and(
          eq(follows.followerActorId, localActor.id),
          eq(follows.followeeActorId, targetActor.id),
        ),
      );
  } else {
    await enqueueFollowNotification({
      followeeActorId: targetActor.id,
      followerActorId: localActor.id,
      followerUserId: session.user.id,
    });
    await enqueueActorTimelineBackfill(targetActor.id);
  }

  revalidatePath("/search");
  revalidatePath(`/@${targetActor.handle}`);
}

export async function unfollowActorAction(formData: FormData) {
  const { session } = await requireUser();
  const actorUri = String(formData.get("actorUri") ?? "").trim();
  if (!actorUri) throw new Error("Remote actor URI is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const targetActor = await findActor(actorUri);
  if (!targetActor) throw new Error("Actor was not found.");
  const [follow] = await db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerActorId, localActor.id),
        eq(follows.followeeActorId, targetActor.id),
      ),
    )
    .limit(1);

  await db
    .update(follows)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(follows.followerActorId, localActor.id),
        eq(follows.followeeActorId, targetActor.id),
      ),
    );

  if (targetActor.type === "remote") {
    if (!follow?.activityUri) {
      throw new Error("Cannot send Undo Follow because the original Follow activity was not recorded.");
    }
    await createOutgoingActivity({
      type: "Undo",
      actorId: localActor.id,
      objectUri: follow.activityUri,
      targetUri: targetActor.uri,
    });
  }

  revalidatePath("/search");
  revalidatePath(`/@${targetActor.handle}`);
}

async function findActor(actorUri: string) {
  const [existing] = await db.select().from(actors).where(eq(actors.uri, actorUri)).limit(1);
  if (existing) return existing;
  return (await lookupRemoteActor(actorUri))?.actor ?? null;
}
