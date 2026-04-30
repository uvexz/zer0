import { sql } from "@/db";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { redisOptionsFromUrl } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    postgres: false,
    redis: false,
  };

  try {
    await sql`select 1`;
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  const redis = new IORedis({
    ...redisOptionsFromUrl(env.REDIS_URL),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  } finally {
    redis.disconnect();
  }

  return Response.json(checks, {
    status: checks.postgres && checks.redis ? 200 : 503,
  });
}
