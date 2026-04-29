import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { signRequest } from "@fedify/fedify";
import { db } from "@/db";
import { activities, actors, deliveryJobs } from "@/db/schema";
import { nextFailureStatus, nextRetryAt } from "@/features/federation/delivery-policy";
import { ensureActorKeyPair } from "@/features/federation/keys";
import { fanoutActivity } from "@/features/federation/outgoing";
import { isDomainBlocked, refreshRemoteResource } from "@/features/federation/remote";
import { buildActivity } from "@/features/federation/vocab";
import { processMediaAsset } from "@/features/media/service";
import { fanoutPostToTimelines } from "@/features/timelines/service";
import { queueNames, redis } from "@/queue";

const workers = [
  new Worker(
    queueNames.federationFanout,
    async (job) => {
      await fanoutActivity(job.data.activityId);
    },
    { connection: redis },
  ),
  new Worker(
    queueNames.federationDeliver,
    async (job) => {
      const [delivery] = await db
        .select()
        .from(deliveryJobs)
        .where(eq(deliveryJobs.id, job.data.deliveryJobId))
        .limit(1);
      const [activity] = await db
        .select()
        .from(activities)
        .where(eq(activities.id, job.data.activityId))
        .limit(1);
      const [sender] = activity?.actorId
        ? await db.select().from(actors).where(eq(actors.id, activity.actorId)).limit(1)
        : [];

      if (!delivery || !activity || !sender || sender.type !== "local") {
        await markDeliveryFailed(job.data.deliveryJobId, job.attemptsMade, "Missing sender, activity, or delivery row.");
        return;
      }

      const inboxHost = new URL(delivery.targetInboxUrl).hostname;
      if (await isDomainBlocked(inboxHost)) {
        await markDeliveryDead(job.data.deliveryJobId, job.attemptsMade, `Blocked domain: ${inboxHost}`);
        return;
      }

      await db
        .update(deliveryJobs)
        .set({
          status: "delivering",
          attemptCount: job.attemptsMade + 1,
          updatedAt: new Date(),
        })
        .where(eq(deliveryJobs.id, job.data.deliveryJobId));

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
            status: response.ok ? "delivered" : nextFailureStatus(job.attemptsMade),
            responseStatus: response.status,
            responseExcerpt: excerpt,
            finalFailureReason: response.ok ? null : response.statusText,
            nextRetryAt: response.ok ? null : nextRetryAt(job.attemptsMade),
            updatedAt: new Date(),
          })
          .where(eq(deliveryJobs.id, job.data.deliveryJobId));

        if (!response.ok) throw new Error(`Delivery failed with HTTP ${response.status}`);
      } catch (error) {
        await markDeliveryFailed(
          job.data.deliveryJobId,
          job.attemptsMade,
          error instanceof Error ? error.message : "Unknown delivery error.",
        );
        throw error;
      }
    },
    { connection: redis },
  ),
  new Worker(queueNames.federationInbox, async () => undefined, { connection: redis }),
  new Worker(
    queueNames.federationFetch,
    async (job) => {
      await refreshRemoteResource(job.data.resource, job.data.kind);
    },
    { connection: redis },
  ),
  new Worker(
    queueNames.mediaProcess,
    async (job) => {
      await processMediaAsset(job.data.mediaId);
    },
    { connection: redis },
  ),
  new Worker(
    queueNames.timelineFanout,
    async (job) => {
      await fanoutPostToTimelines(job.data.postId);
    },
    { connection: redis },
  ),
  new Worker(queueNames.notifications, async () => undefined, { connection: redis }),
  new Worker(queueNames.maintenance, async () => undefined, { connection: redis }),
];

console.log(`Zer0 worker started with ${workers.length} processors.`);

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await redis.quit();
  process.exit(0);
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
