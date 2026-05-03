import IORedis from "ioredis";
import { env } from "@/lib/env";
import { redisOptionsFromUrl } from "@/lib/redis";

const globalForRedis = globalThis as typeof globalThis & {
  zer0Redis?: IORedis;
};

export const redis =
  globalForRedis.zer0Redis ??
  new IORedis({
    ...redisOptionsFromUrl(env.REDIS_URL),
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

if (redis.listenerCount("error") === 0) {
  redis.on("error", () => {});
}

if (process.env.NODE_ENV !== "production") {
  globalForRedis.zer0Redis = redis;
}
