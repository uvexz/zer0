type Bucket = {
  count: number;
  resetAt: number;
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

export function checkRateLimit(
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
