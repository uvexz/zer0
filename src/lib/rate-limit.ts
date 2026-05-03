import { cacheRedis } from "@/lib/redis-cache-client";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  zer0RateLimitBuckets?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.zer0RateLimitBuckets ?? new Map<string, Bucket>();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.zer0RateLimitBuckets = buckets;
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: Date;
};

const rateLimitNamespace = "zer0:rate-limit:v1";

export async function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  store: RateLimitStore = cacheRedis,
): Promise<RateLimitResult> {
  const redisResult = await checkRedisRateLimit(key, options, store);
  return redisResult ?? checkMemoryRateLimit(key, options);
}

function checkMemoryRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    ok: bucket.count <= options.limit,
    remaining: Math.max(options.limit - bucket.count, 0),
    resetAt: new Date(bucket.resetAt),
  };
}

async function checkRedisRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  store: RateLimitStore,
): Promise<RateLimitResult | null> {
  const redisKey = `${rateLimitNamespace}:${key}`;

  try {
    const count = await store.incr(redisKey);
    if (count === 1) {
      await store.pexpire(redisKey, options.windowMs);
    }

    let ttlMs = await store.pttl(redisKey);
    if (ttlMs < 0) {
      await store.pexpire(redisKey, options.windowMs);
      ttlMs = options.windowMs;
    }

    return {
      ok: count <= options.limit,
      remaining: Math.max(options.limit - count, 0),
      resetAt: new Date(Date.now() + ttlMs),
    };
  } catch {
    return null;
  }
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": result.resetAt.toISOString(),
  };
}

export function clientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
