import IORedis from "ioredis";
import { env } from "@/lib/env";
import { redisOptionsFromUrl } from "@/lib/redis";

const globalForCacheRedis = globalThis as typeof globalThis & {
  zer0CacheRedis?: IORedis;
};

export const cacheRedis =
  globalForCacheRedis.zer0CacheRedis ??
  new IORedis({
    ...redisOptionsFromUrl(env.REDIS_URL),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: 100,
  });

if (process.env.NODE_ENV !== "production") {
  globalForCacheRedis.zer0CacheRedis = cacheRedis;
}
