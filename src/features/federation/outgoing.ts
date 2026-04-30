import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  actors,
  deliveryJobs,
  follows,
  postMentions,
  postRecipients,
  posts,
} from "@/db/schema";
import { federationDeliverQueue, federationFanoutQueue } from "@/queue";
import { env } from "@/lib/env";
import { createId } from "@/lib/id";
import { maxDeliveryAttempts, retryDelaysMs } from "./delivery-policy";
import { createAudienceForVisibility, objectActivityAudience } from "./recipient-policy";
import { isDomainBlocked } from "./remote";

export type OutgoingActivityType =
  | "Create"
  | "Delete"
  | "Follow"
  | "Accept"
  | "Reject"
  | "Like"
  | "Announce"
  | "Undo"
  | "Update";

export async function createOutgoingActivity(input: {
  type: OutgoingActivityType;
  actorId: string;
  objectUri?: string | null;
  targetUri?: string | null;
  rawJson?: unknown;
}) {
  const id = createId("activity");
  const uri = `${env.APP_ORIGIN}/activities/${id}`;
  const [activity] = await db
    .insert(activities)
    .values({
      id,
      uri,
      direction: "outgoing",
      type: input.type,
      actorId: input.actorId,
      objectUri: input.objectUri ?? null,
      targetUri: input.targetUri ?? null,
      rawJson: input.rawJson,
    })
    .returning();

  await federationFanoutQueue.add("fanout", { activityId: activity.id });
  return activity;
}

export async function enqueueActivityFanout(activityId: string) {
  await federationFanoutQueue.add("fanout", { activityId });
}

export async function fanoutActivity(activityId: string) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!activity || activity.direction !== "outgoing") return;

  const recipients = await resolveRecipients(activity);
  for (const recipient of uniqueActorsByDeliveryInbox(recipients)) {
    await enqueueDelivery(activity, recipient);
  }
}

async function resolveRecipients(activity: typeof activities.$inferSelect) {
  if (!activity.actorId) return [];

  if (activity.type === "Create" && activity.objectUri) {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.uri, activity.objectUri))
      .limit(1);

    if (!post) return [];

    if (createAudienceForVisibility(post.visibility) === "explicit") {
      const rows = await db
        .select({ actor: actors })
        .from(postRecipients)
        .innerJoin(actors, eq(actors.id, postRecipients.actorId))
        .where(eq(postRecipients.postId, post.id));
      return deliverableRemoteActors(rows.map(({ actor }) => actor));
    }

    const mentioned = await mentionedActors(post.id);
    return deliverableRemoteActors(uniqueActors([...(await acceptedFollowers(activity.actorId)), ...mentioned]));
  }

  if (activity.targetUri) {
    const [target] = await db
      .select()
      .from(actors)
      .where(eq(actors.uri, activity.targetUri))
      .limit(1);
    return deliverableRemoteActors(target ? [target] : []);
  }

  if (activity.objectUri) {
    if (activity.type === "Delete") {
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.uri, activity.objectUri))
        .limit(1);
      if (
        post &&
        objectActivityAudience({
          type: activity.type,
          actorOwnsObject: post.authorActorId === activity.actorId,
        }) === "followers"
      ) {
        return deliverableRemoteActors(await acceptedFollowers(activity.actorId));
      }
    }

    const [post] = await db
      .select({ author: actors })
      .from(posts)
      .innerJoin(actors, eq(actors.id, posts.authorActorId))
      .where(eq(posts.uri, activity.objectUri))
      .limit(1);
    return deliverableRemoteActors(post?.author ? [post.author] : []);
  }

  return deliverableRemoteActors(await acceptedFollowers(activity.actorId));
}

async function acceptedFollowers(actorId: string) {
  const rows = await db
    .select({ actor: actors })
    .from(follows)
    .innerJoin(actors, eq(actors.id, follows.followerActorId))
    .where(and(eq(follows.followeeActorId, actorId), eq(follows.state, "accepted")));

  return rows.map(({ actor }) => actor);
}

async function mentionedActors(postId: string) {
  const rows = await db
    .select({ actor: actors })
    .from(postMentions)
    .innerJoin(actors, eq(actors.id, postMentions.actorId))
    .where(eq(postMentions.postId, postId));

  return rows.map(({ actor }) => actor);
}

async function enqueueDelivery(
  activity: typeof activities.$inferSelect,
  recipient: typeof actors.$inferSelect,
) {
  const targetInboxUrl = deliveryInboxForActor(recipient);
  if (!targetInboxUrl) return;

  const [existing] = await db
    .select()
    .from(deliveryJobs)
    .where(
      and(
        eq(deliveryJobs.activityUri, activity.uri),
        eq(deliveryJobs.targetInboxUrl, targetInboxUrl),
      ),
    )
    .limit(1);

  const job =
    existing ??
    (
      await db
        .insert(deliveryJobs)
        .values({
          id: createId("delivery"),
          targetInboxUrl,
          activityUri: activity.uri,
          activityType: activity.type,
        })
        .returning()
    )[0];

  await federationDeliverQueue.add(
    "deliver",
    {
      deliveryJobId: job.id,
      activityId: activity.id,
      recipientActorId: recipient.id,
    },
    {
      attempts: maxDeliveryAttempts,
      backoff: { type: "exponential", delay: retryDelaysMs[0] },
    },
  );
}

function isRemoteDeliverable(actor: typeof actors.$inferSelect) {
  return isRemoteActorDeliverable(actor);
}

async function deliverableRemoteActors(actorRows: Array<typeof actors.$inferSelect>) {
  const deliverable = [];
  for (const actor of actorRows) {
    if (isRemoteDeliverable(actor) && !(await isDomainBlocked(actor.domain))) {
      deliverable.push(actor);
    }
  }
  return deliverable;
}

function uniqueActors(actorRows: Array<typeof actors.$inferSelect>) {
  return Array.from(new Map(actorRows.map((actor) => [actor.id, actor])).values());
}

export function deliveryInboxForActor(
  actor: Pick<typeof actors.$inferSelect, "inboxUrl" | "sharedInboxUrl">,
) {
  return actor.sharedInboxUrl ?? actor.inboxUrl;
}

export function isRemoteActorDeliverable(
  actor: Pick<typeof actors.$inferSelect, "type" | "blockedAt" | "inboxUrl" | "sharedInboxUrl">,
) {
  return actor.type === "remote" && !actor.blockedAt && Boolean(deliveryInboxForActor(actor));
}

export function uniqueActorsByDeliveryInbox<T extends Pick<typeof actors.$inferSelect, "inboxUrl" | "sharedInboxUrl">>(
  actorRows: T[],
) {
  const actorsByInbox = new Map<string, T>();
  for (const actor of actorRows) {
    const inbox = deliveryInboxForActor(actor);
    if (inbox && !actorsByInbox.has(inbox)) actorsByInbox.set(inbox, actor);
  }
  return Array.from(actorsByInbox.values());
}

export async function enqueueDeliveriesForActors(activityId: string, actorIds: string[]) {
  if (!actorIds.length) return;
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  if (!activity) return;

  const recipients = await db.select().from(actors).where(inArray(actors.id, actorIds));
  for (const recipient of recipients) {
    await enqueueDelivery(activity, recipient);
  }
}
