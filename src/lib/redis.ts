import type { RedisOptions } from "ioredis";

export function redisOptionsFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }

  const dbPath = url.pathname.replace(/^\//, "");

  if (dbPath !== "" && !/^\d+$/.test(dbPath)) {
    throw new Error("REDIS_URL database must be an integer");
  }

  const db = dbPath === "" ? undefined : Number.parseInt(dbPath, 10);

  return {
    host: url.hostname || "localhost",
    port: url.port === "" ? 6379 : Number.parseInt(url.port, 10),
    username: url.username === "" ? undefined : decodeURIComponent(url.username),
    password: url.password === "" ? undefined : decodeURIComponent(url.password),
    db,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}
