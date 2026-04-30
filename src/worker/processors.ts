import { signRequest } from "@fedify/fedify";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { activities, actors, deliveryJobs } from "@/db/schema";
import { nextFailureStatus, nextRetryAt, maxDeliveryAttempts, retryDelaysMs } from "@/features/federation/delivery-policy";
import { ensureActorKeyPair } from "@/features/federation/keys";
import { fanoutActivity } from "@/features/federation/outgoing";
import { processInboxEvent } from "@/features/federation/incoming";
import { isDomainBlocked, refreshRemoteResource } from "@/features/federation/remote";
import { buildActivity } from "@/features/federation/vocab";
import { processMediaAsset } from "@/features/media/service";
import { processNotificationJob } from "@/features/notifications/service";
import { fanoutPostToTimelines } from "@/features/timelines/service";
import {
  federationDeliverQueue,
  type FederationDeliverJob,
  type FederationFanoutJob,
  type FederationFetchJob,
  type FederationInboxJob,
  type MaintenanceJob,
  type MediaProcessJob,
  type NotificationJob,
  type TimelineFanoutJob,
} from "@/queue";

export async function processFederationFanoutJob(job: FederationFanoutJob) {
  await fanoutActivity(job.activityId);
}

export async function processFederationInboxJob(job: FederationInboxJob) {
  await processInboxEvent(job.inboxEventId);
}

export async function processFederationFetchJob(job: FederationFetchJob) {
  await refreshRemoteResource(job.resource, job.kind);
}

export async function processMediaProcessJob(job: MediaProcessJob) {
  await processMediaAsset(job.mediaId);
}

export async function processTimelineFanoutJob(job: TimelineFanoutJob) {
  await fanoutPostToTimelines(job.postId);
}

export async function processNotificationsJob(job: NotificationJob) {
  await processNotificationJob(job);
}

export async function processFederationDeliverJob(job: FederationDeliverJob, attemptsMade: number) {
  const [delivery] = await db
    .select()
    .from(deliveryJobs)
    .where(eq(deliveryJobs.id, job.deliveryJobId))
    .limit(1);
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, job.activityId))
    .limit(1);
  const [sender] = activity?.actorId
    ? await db.select().from(actors).where(eq(actors.id, activity.actorId)).limit(1)
    : [];

  if (!delivery || !activity || !sender || sender.type !== "local") {
    await markDeliveryFailed(job.deliveryJobId, attemptsMade, "Missing sender, activity, or delivery row.");
    return;
  }

  const inboxHost = new URL(delivery.targetInboxUrl).hostname;
  if (await isDomainBlocked(inboxHost)) {
    await markDeliveryDead(job.deliveryJobId, attemptsMade, `Blocked domain: ${inboxHost}`);
    return;
  }

  await db
    .update(deliveryJobs)
    .set({
      status: "delivering",
      attemptCount: attemptsMade + 1,
      updatedAt: new Date(),
    })
    .where(eq(deliveryJobs.id, job.deliveryJobId));

  try {
    const fedifyActivity = await buildActivity(activity);
    if (!fedifyActivity) throw new Error(`Unsupported activity type: ${activity.type}`);
    const body = JSON.stringify(await fedifyActivity.toJsonLd({ format: "compact" }));
    const bodyBytes = new TextEncoder().encode(body);
    const keyPair = await ensureActorKeyPair(sender);
    const request = new Request(delivery.targetInboxUrl, {
      method: "POST",
      headers: {
        accept: "application/activity+json",
        "content-type": "application/activity+json",
      },
      body,
    });
    const signedRequest = await signRequest(request, keyPair.privateKey, keyPair.keyId, {
      spec: "draft-cavage-http-signatures-12",
      body: bodyBytes.buffer,
    });
    const response = await fetch(signedRequest);
    const excerpt = (await response.text()).slice(0, 1000);

    await db
      .update(deliveryJobs)
      .set({
        status: response.ok ? "delivered" : nextFailureStatus(attemptsMade),
        responseStatus: response.status,
        responseExcerpt: excerpt,
        finalFailureReason: response.ok ? null : response.statusText,
        nextRetryAt: response.ok ? null : nextRetryAt(attemptsMade),
        updatedAt: new Date(),
      })
      .where(eq(deliveryJobs.id, job.deliveryJobId));

    if (!response.ok) throw new Error(`Delivery failed with HTTP ${response.status}`);
  } catch (error) {
    await markDeliveryFailed(
      job.deliveryJobId,
      attemptsMade,
      error instanceof Error ? error.message : "Unknown delivery error.",
    );
    throw error;
  }
}

export async function processMaintenanceJob(job: MaintenanceJob) {
  if (job.task !== "delivery-maintenance") return;
  await recoverStuckDeliveries();
  await enqueueDueFailedDeliveries();
}

export const deliveryMaintenanceStuckMs = 15 * 60_000;

export function isStuckDelivering(input: {
  status: string;
  updatedAt: Date;
}, now = new Date()) {
  return input.status === "delivering" && input.updatedAt.getTime() <= now.getTime() - deliveryMaintenanceStuckMs;
}

export function isDueFailedDelivery(input: {
  status: string;
  nextRetryAt: Date | null;
}, now = new Date()) {
  return input.status === "failed" && Boolean(input.nextRetryAt && input.nextRetryAt <= now);
}

async function recoverStuckDeliveries(now = new Date()) {
  const stuckBefore = new Date(now.getTime() - deliveryMaintenanceStuckMs);
  await db
    .update(deliveryJobs)
    .set({
      status: "failed",
      finalFailureReason: "Delivery timed out while marked delivering.",
      nextRetryAt: now,
      updatedAt: now,
    })
    .where(and(eq(deliveryJobs.status, "delivering"), lte(deliveryJobs.updatedAt, stuckBefore)));
}

async function enqueueDueFailedDeliveries(now = new Date()) {
  const rows = await db
    .select({ delivery: deliveryJobs, activityId: activities.id })
    .from(deliveryJobs)
    .innerJoin(activities, eq(activities.uri, deliveryJobs.activityUri))
    .where(and(eq(deliveryJobs.status, "failed"), lte(deliveryJobs.nextRetryAt, now)));

  for (const row of rows) {
    await db
      .update(deliveryJobs)
      .set({
        status: "queued",
        finalFailureReason: null,
        updatedAt: now,
      })
      .where(eq(deliveryJobs.id, row.delivery.id));
    await federationDeliverQueue.add(
      "deliver",
      {
        deliveryJobId: row.delivery.id,
        activityId: row.activityId,
        recipientActorId: "",
      },
      {
        attempts: maxDeliveryAttempts,
        backoff: { type: "exponential", delay: retryDelaysMs[0] },
      },
    );
  }
}

async function markDeliveryFailed(deliveryJobId: string, attemptsMade: number, reason: string) {
  const status = nextFailureStatus(attemptsMade);
  await db
    .update(deliveryJobs)
    .set({
      status,
      attemptCount: attemptsMade + 1,
      finalFailureReason: reason,
      nextRetryAt: nextRetryAt(attemptsMade),
      updatedAt: new Date(),
    })
    .where(eq(deliveryJobs.id, deliveryJobId));
}

async function markDeliveryDead(deliveryJobId: string, attemptsMade: number, reason: string) {
  await db
    .update(deliveryJobs)
    .set({
      status: "dead",
      attemptCount: attemptsMade + 1,
      finalFailureReason: reason,
      nextRetryAt: null,
      updatedAt: new Date(),
    })
    .where(eq(deliveryJobs.id, deliveryJobId));
}
