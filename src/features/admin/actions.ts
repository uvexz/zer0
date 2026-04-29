"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, deliveryJobs, domainBlocks, invites } from "@/db/schema";
import { requireAdmin } from "@/features/auth/guards";
import { createId } from "@/lib/id";
import { federationDeliverQueue } from "@/queue";
import { maxDeliveryAttempts, retryDelaysMs } from "@/features/federation/delivery-policy";

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

export async function disableInviteAction(formData: FormData) {
  const { session } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.update(invites).set({ disabledAt: new Date() }).where(eq(invites.id, id));
  await audit(session.user.id, "invite.disable", id);
  revalidatePath("/admin/invites");
}

export async function blockDomainAction(formData: FormData) {
  const { session } = await requireAdmin();
  const domain = String(formData.get("domain") ?? "").toLowerCase().trim();
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

export async function retryDeliveryAction(formData: FormData) {
  const { session } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const [job] = await db
    .update(deliveryJobs)
    .set({
      status: "queued",
      nextRetryAt: new Date(),
      finalFailureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(deliveryJobs.id, id))
    .returning();

  if (job) {
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.uri, job.activityUri))
      .limit(1);

    if (activity) {
      await federationDeliverQueue.add(
        "deliver",
        {
          deliveryJobId: job.id,
          activityId: activity.id,
          recipientActorId: "",
        },
        {
          attempts: maxDeliveryAttempts,
          backoff: { type: "exponential", delay: retryDelaysMs[0] },
        },
      );
    }
  }

  await audit(session.user.id, "delivery.retry", id);
  revalidatePath("/admin/federation");
}

async function audit(actorUserId: string, action: string, target: string) {
  await db.insert(auditLogs).values({
    id: createId("audit"),
    actorUserId,
    action,
    target,
  });
}
