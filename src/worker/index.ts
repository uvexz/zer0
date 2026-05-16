import { Worker } from "bullmq";
import {
  deliveryMaintenanceJobId,
  maintenanceQueue,
  queueNames,
} from "@/queue";
import { redis } from "@/lib/redis-client";
import { closeDb } from "@/db";
import {
  processFederationDeliverJob,
  processFederationFanoutJob,
  processFederationFetchJob,
  processFederationInboxJob,
  processMaintenanceJob,
  processMediaProcessJob,
  processNotificationsJob,
  processTimelineFanoutJob,
} from "./processors";

await maintenanceQueue.add(
  "delivery-maintenance",
  { task: "delivery-maintenance" },
  {
    jobId: deliveryMaintenanceJobId,
    repeat: { every: 5 * 60_000 },
  },
);

const workers = [
  new Worker(
    queueNames.federationFanout,
    async (job) => processFederationFanoutJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.federationDeliver,
    async (job) => processFederationDeliverJob(job.data, job.attemptsMade),
    { connection: redis },
  ),
  new Worker(
    queueNames.federationInbox,
    async (job) => processFederationInboxJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.federationFetch,
    async (job) => processFederationFetchJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.mediaProcess,
    async (job) => processMediaProcessJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.timelineFanout,
    async (job) => processTimelineFanoutJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.notifications,
    async (job) => processNotificationsJob(job.data),
    { connection: redis },
  ),
  new Worker(
    queueNames.maintenance,
    async (job) => processMaintenanceJob(job.data),
    { connection: redis },
  ),
];

console.log(`Zer0 worker started with ${workers.length} processors.`);

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await closeDb();
  await redis.quit();
  process.exit(0);
}
