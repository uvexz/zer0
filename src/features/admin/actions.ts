"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, actors, auditLogs, deliveryJobs, domainBlocks, invites, posts, profiles, siteSettings } from "@/db/schema";
import { requireAdmin } from "@/features/auth/guards";
import { defaultSiteSettings, SITE_SETTINGS_CACHE_TAG, SITE_SETTINGS_ID } from "@/features/site/settings";
import { cacheTags } from "@/lib/cache-tags";
import { invalidateCacheTagsFromAction } from "@/lib/cache-invalidation";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { federationDeliverJobPayload, federationDeliverQueue } from "@/queue";
import { maxDeliveryAttempts, retryDelaysMs } from "@/features/federation/delivery-policy";
import {
  canModerateActor,
  canToggleUserDisabled,
  isDeliveryRetryableStatus,
  normalizeDomainBlock,
} from "./policy";

export async function createInviteAction(formData: FormData) {
  const { session } = await requireAdmin();
  const code = String(formData.get("code") || `ZER0-${crypto.randomUUID().slice(0, 8)}`).toUpperCase();
  const maxUses = Number(formData.get("maxUses") ?? 1) || 1;

  await db.insert(invites).values({
    id: createId("invite"),
    code,
    creatorUserId: session.user.id,
    maxUses,
  });

  await audit(session.user.id, "invite.create", code);
  revalidatePath("/admin/invites");
}

export async function updateSiteSettingsAction(formData: FormData) {
  const { session } = await requireAdmin();
  const siteName = String(formData.get("siteName") ?? "").trim() || defaultSiteSettings.siteName;
  const siteDescription = String(formData.get("siteDescription") ?? "").trim();
  const showLocalZosts = formData.get("showLocalZosts") === "on";

  await db
    .insert(siteSettings)
    .values({
      id: SITE_SETTINGS_ID,
      siteName,
      siteDescription,
      showLocalZosts,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        siteName,
        siteDescription,
        showLocalZosts,
        updatedAt: new Date(),
      },
    });

  await audit(session.user.id, "site_settings.update", SITE_SETTINGS_ID);
  await invalidateCacheTagsFromAction([SITE_SETTINGS_CACHE_TAG]);
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function disableInviteAction(formData: FormData) {
  const { session } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.update(invites).set({ disabledAt: new Date() }).where(eq(invites.id, id));
  await audit(session.user.id, "invite.disable", id);
  revalidatePath("/admin/invites");
}

export async function blockDomainAction(formData: FormData) {
  const { session } = await requireAdmin();
  const domain = normalizeDomainBlock(String(formData.get("domain") ?? ""));
  const reason = String(formData.get("reason") ?? "");
  if (!domain) return;

  await db
    .insert(domainBlocks)
    .values({
      id: createId("domain_block"),
      domain,
      reason,
      createdByUserId: session.user.id,
    })
    .onConflictDoNothing();

  await audit(session.user.id, "domain.block", domain);
  revalidatePath("/admin/blocks");
}

export async function unblockDomainAction(formData: FormData) {
  const { session } = await requireAdmin();
  const domain = normalizeDomainBlock(String(formData.get("domain") ?? ""));
  if (!domain) return;

  await db.delete(domainBlocks).where(eq(domainBlocks.domain, domain));
  await audit(session.user.id, "domain.unblock", domain);
  revalidatePath("/admin/blocks");
}

export async function disableUserAction(formData: FormData) {
  const { session } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile || !canToggleUserDisabled({
    currentUserId: session.user.id,
    targetUserId: profile.userId,
    targetIsAdmin: profile.isAdmin,
  })) {
    throw new Error("This user cannot be disabled.");
  }

  await db.update(profiles).set({ disabledAt: new Date(), updatedAt: new Date() }).where(eq(profiles.userId, userId));
  await audit(session.user.id, "user.disable", userId);
  await invalidateCacheTagsFromAction([
    cacheTags.profile(profile.username),
    cacheTags.localTimeline,
    cacheTags.nodeInfo,
  ]);
  revalidatePath("/admin/users");
}

export async function restoreUserAction(formData: FormData) {
  const { session } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile || !canToggleUserDisabled({
    currentUserId: session.user.id,
    targetUserId: profile.userId,
    targetIsAdmin: profile.isAdmin,
  })) {
    throw new Error("This user cannot be restored.");
  }

  await db.update(profiles).set({ disabledAt: null, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  await audit(session.user.id, "user.restore", userId);
  await invalidateCacheTagsFromAction([
    cacheTags.profile(profile.username),
    cacheTags.localTimeline,
    cacheTags.nodeInfo,
  ]);
  revalidatePath("/admin/users");
}

export async function hidePostAction(formData: FormData) {
  const { session } = await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const [post] = await db.update(posts).set({ hiddenAt: new Date() }).where(eq(posts.id, postId)).returning();
  if (!post) return;

  await audit(session.user.id, "post.hide", postId);
  await revalidateModerationPost(post);
}

export async function restorePostAction(formData: FormData) {
  const { session } = await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const [post] = await db.update(posts).set({ hiddenAt: null }).where(eq(posts.id, postId)).returning();
  if (!post) return;

  await audit(session.user.id, "post.restore", postId);
  await revalidateModerationPost(post);
}

export async function blockActorAction(formData: FormData) {
  const { session } = await requireAdmin();
  const actorId = String(formData.get("actorId") ?? "");
  const [actor] = await db.select().from(actors).where(eq(actors.id, actorId)).limit(1);
  if (!actor || !canModerateActor({ actorType: actor.type })) {
    throw new Error("Only remote actors can be blocked.");
  }

  await db.update(actors).set({ blockedAt: new Date(), updatedAt: new Date() }).where(eq(actors.id, actorId));
  await audit(session.user.id, "actor.block", actor.uri);
  await revalidateModerationActor(actor);
}

export async function unblockActorAction(formData: FormData) {
  const { session } = await requireAdmin();
  const actorId = String(formData.get("actorId") ?? "");
  const [actor] = await db.select().from(actors).where(and(eq(actors.id, actorId), eq(actors.type, "remote"))).limit(1);
  if (!actor) return;

  await db.update(actors).set({ blockedAt: null, updatedAt: new Date() }).where(eq(actors.id, actorId));
  await audit(session.user.id, "actor.unblock", actor.uri);
  await revalidateModerationActor(actor);
}

export async function retryDeliveryAction(formData: FormData) {
  const { session } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const [delivery] = await db.select().from(deliveryJobs).where(eq(deliveryJobs.id, id)).limit(1);
  if (!delivery || !isDeliveryRetryableStatus(delivery.status)) return;

  const [activity] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.uri, delivery.activityUri))
    .limit(1);
  if (!activity) return;

  const [job] = await db
    .update(deliveryJobs)
    .set({
      status: "queued",
      responseStatus: null,
      responseExcerpt: null,
      nextRetryAt: null,
      finalFailureReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(deliveryJobs.id, id), eq(deliveryJobs.status, delivery.status)))
    .returning();

  if (job) {
    await federationDeliverQueue.add(
      "deliver",
      federationDeliverJobPayload({
        deliveryJobId: job.id,
        activityId: activity.id,
      }),
      {
        attempts: maxDeliveryAttempts,
        backoff: { type: "exponential", delay: retryDelaysMs[0] },
      },
    );
    await audit(session.user.id, "delivery.retry", id);
    revalidatePath("/admin/federation");
  }
}

async function audit(actorUserId: string, action: string, target: string, metadata?: unknown) {
  await db.insert(auditLogs).values({
    id: createId("audit"),
    actorUserId,
    action,
    target,
    metadata,
  });
}

async function revalidateModerationPost(post: typeof posts.$inferSelect) {
  await invalidateCacheTagsFromAction([
    cacheTags.post(post.id),
    cacheTags.localTimeline,
    cacheTags.nodeInfo,
  ]);
  revalidatePath("/");
  revalidatePath("/admin/moderation");
  revalidatePath(`/objects/${post.id}`);
  revalidatePostUrl(post.url);
}

async function revalidateModerationActor(actor: typeof actors.$inferSelect) {
  await invalidateCacheTagsFromAction([
    cacheTags.actor(actor.id),
    cacheTags.profile(actor.handle),
    cacheTags.localTimeline,
  ]);
  revalidatePath("/admin/moderation");
  revalidatePath("/search");
  revalidatePath(actor.type === "remote" ? `/@${actor.handle}@${actor.domain}` : `/@${actor.handle}`);
}

function revalidatePostUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin === env.APP_ORIGIN) revalidatePath(parsed.pathname);
  } catch {
    if (url.startsWith("/")) revalidatePath(url);
  }
}
