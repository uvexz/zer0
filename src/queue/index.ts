import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

export type FederationDeliverJob = {
  deliveryJobId: string;
  activityId: string;
  recipientActorId: string;
};

export type FederationFanoutJob = {
  activityId: string;
};

export type FederationFetchJob = {
  resource: string;
  kind?: "actor" | "object" | "webfinger";
};

export type MediaProcessJob = {
  mediaId: string;
};

const globalForRedis = globalThis as typeof globalThis & {
  zer0Redis?: IORedis;
};

export const redis =
  globalForRedis.zer0Redis ??
  new IORedis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.zer0Redis = redis;
}

export const queueNames = {
  federationDeliver: "federation-deliver",
  federationFanout: "federation-fanout",
  federationInbox: "federation-inbox",
  federationFetch: "federation-fetch",
  mediaProcess: "media-process",
  timelineFanout: "timelines-fanout",
  notifications: "notifications-create",
  maintenance: "maintenance-cleanup",
} as const;

class LazyQueue<T> {
  private queue?: Queue<T, unknown, string>;

  constructor(private readonly name: string) {}

  add(name: string, data: T, options?: JobsOptions) {
    return this.getQueue().add(name as never, data as never, options);
  }

  private getQueue() {
    this.queue ??= new Queue<T, unknown, string>(this.name, { connection: redis });
    return this.queue;
  }
}

export const federationDeliverQueue = new LazyQueue<FederationDeliverJob>(queueNames.federationDeliver);
export const federationFanoutQueue = new LazyQueue<FederationFanoutJob>(queueNames.federationFanout);
export const federationInboxQueue = new LazyQueue(queueNames.federationInbox);
export const federationFetchQueue = new LazyQueue<FederationFetchJob>(queueNames.federationFetch);
export const mediaProcessQueue = new LazyQueue<MediaProcessJob>(queueNames.mediaProcess);
export const timelineFanoutQueue = new LazyQueue(queueNames.timelineFanout);
export const notificationsQueue = new LazyQueue(queueNames.notifications);
export const maintenanceQueue = new LazyQueue(queueNames.maintenance);
