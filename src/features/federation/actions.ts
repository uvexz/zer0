"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actors, follows, profiles } from "@/db/schema";
import { ensureLocalActor } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { enqueueFollowNotification } from "@/features/notifications/service";
import { enqueueActorTimelineBackfill } from "@/features/timelines/service";
import { cacheTags } from "@/lib/cache-tags";
import { invalidateCacheTagsFromAction } from "@/lib/cache-invalidation";
import { checkRateLimit } from "@/lib/rate-limit";
import { canModeratePendingFollower, followStateForApprovalPolicy } from "./follow-policy";
import { createOutgoingActivity } from "./outgoing";
import { lookupRemoteActor } from "./remote";

export async function searchRemoteActorAction(formData: FormData) {
  const { session } = await requireUser();
  const rateLimit = await checkRateLimit(`remote-search:${session.user.id}`, {
    limit: 60,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.ok) throw new Error("Too many remote searches. Try again later.");

  const query = String(formData.get("q") ?? "").trim();
  if (!query) return null;
  return lookupRemoteActor(query);
}

export async function followActorAction(formData: FormData) {
  const { session, profile } = await requireUser();
  const actorUri = String(formData.get("actorUri") ?? "").trim();
  if (!actorUri) throw new Error("Remote actor URI is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const targetActor = await findActor(actorUri);
  if (!targetActor) throw new Error("Actor was not found.");
  if (targetActor.id === localActor.id) throw new Error("You cannot follow yourself.");
  const state = await initialFollowState(targetActor);

  await db
    .insert(follows)
    .values({
      followerActorId: localActor.id,
      followeeActorId: targetActor.id,
      state,
    })
    .onConflictDoUpdate({
      target: [follows.followerActorId, follows.followeeActorId],
      set: {
        state,
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
    if (state === "accepted") {
      await enqueueActorTimelineBackfill(targetActor.id);
    }
  }

  await invalidateCacheTagsFromAction([
    cacheTags.actor(targetActor.id),
    targetActor.type === "local" ? cacheTags.profile(targetActor.handle) : null,
    targetActor.type === "local" ? cacheTags.followersCollection(targetActor.handle) : null,
    cacheTags.followingCollection(profile.username),
  ]);
  revalidatePath("/search");
  revalidatePath(`/@${targetActor.handle}`);
}

export async function approveFollowerAction(formData: FormData) {
  const { session } = await requireUser();
  const followerActorId = String(formData.get("followerActorId") ?? "").trim();
  if (!followerActorId) throw new Error("Follower actor is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const [follow] = await db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerActorId, followerActorId),
        eq(follows.followeeActorId, localActor.id),
      ),
    )
    .limit(1);
  if (!follow || !canModeratePendingFollower({
    viewerActorId: localActor.id,
    followeeActorId: follow.followeeActorId,
    state: follow.state,
  })) {
    throw new Error("Pending follower request was not found.");
  }

  await db
    .update(follows)
    .set({ state: "accepted", updatedAt: new Date() })
    .where(
      and(
        eq(follows.followerActorId, followerActorId),
        eq(follows.followeeActorId, localActor.id),
      ),
    );

  const follower = await actorById(followerActorId);
  if (follower?.type === "remote" && follow.activityUri) {
    await createOutgoingActivity({
      type: "Accept",
      actorId: localActor.id,
      objectUri: follow.activityUri,
      targetUri: follower.uri,
    });
  }
  await enqueueActorTimelineBackfill(localActor.id);

  await invalidateCacheTagsFromAction([
    cacheTags.actor(localActor.id),
    follower ? cacheTags.actor(follower.id) : null,
    cacheTags.followers(localActor.id),
    cacheTags.followersCollection(localActor.handle),
    cacheTags.profile(localActor.handle),
  ]);
  revalidatePath("/settings/federation");
}

export async function rejectFollowerAction(formData: FormData) {
  const { session } = await requireUser();
  const followerActorId = String(formData.get("followerActorId") ?? "").trim();
  if (!followerActorId) throw new Error("Follower actor is required.");

  const localActor = await ensureLocalActor(session.user.id);
  const [follow] = await db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerActorId, followerActorId),
        eq(follows.followeeActorId, localActor.id),
      ),
    )
    .limit(1);
  if (!follow || !canModeratePendingFollower({
    viewerActorId: localActor.id,
    followeeActorId: follow.followeeActorId,
    state: follow.state,
  })) {
    throw new Error("Pending follower request was not found.");
  }

  await db
    .update(follows)
    .set({ state: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(follows.followerActorId, followerActorId),
        eq(follows.followeeActorId, localActor.id),
      ),
    );

  const follower = await actorById(followerActorId);
  if (follower?.type === "remote" && follow.activityUri) {
    await createOutgoingActivity({
      type: "Reject",
      actorId: localActor.id,
      objectUri: follow.activityUri,
      targetUri: follower.uri,
    });
  }

  await invalidateCacheTagsFromAction([
    cacheTags.actor(localActor.id),
    follower ? cacheTags.actor(follower.id) : null,
    cacheTags.followers(localActor.id),
    cacheTags.followersCollection(localActor.handle),
    cacheTags.profile(localActor.handle),
  ]);
  revalidatePath("/settings/federation");
}

export async function unfollowActorAction(formData: FormData) {
  const { session, profile } = await requireUser();
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

  await invalidateCacheTagsFromAction([
    cacheTags.actor(targetActor.id),
    targetActor.type === "local" ? cacheTags.profile(targetActor.handle) : null,
    targetActor.type === "local" ? cacheTags.followersCollection(targetActor.handle) : null,
    cacheTags.followingCollection(profile.username),
  ]);
  revalidatePath("/search");
  revalidatePath(`/@${targetActor.handle}`);
}

async function findActor(actorUri: string) {
  const [existing] = await db.select().from(actors).where(eq(actors.uri, actorUri)).limit(1);
  if (existing) return existing;
  return (await lookupRemoteActor(actorUri))?.actor ?? null;
}

async function actorById(actorId: string) {
  const [actor] = await db.select().from(actors).where(eq(actors.id, actorId)).limit(1);
  return actor ?? null;
}

async function initialFollowState(targetActor: typeof actors.$inferSelect) {
  if (targetActor.type === "remote") return "pending";
  if (!targetActor.userId) return "accepted";

  const [profile] = await db
    .select({ manuallyApprovesFollowers: profiles.manuallyApprovesFollowers })
    .from(profiles)
    .where(eq(profiles.userId, targetActor.userId))
    .limit(1);

  return followStateForApprovalPolicy(Boolean(profile?.manuallyApprovesFollowers));
}
