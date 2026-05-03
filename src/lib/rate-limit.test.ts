import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

class MemoryRateLimitStore {
  values = new Map<string, { count: number; expiresAt: number }>();

  async incr(key: string) {
    const now = Date.now();
    const current = this.values.get(key);
    const count = current && current.expiresAt > now ? current.count + 1 : 1;
    this.values.set(key, { count, expiresAt: current?.expiresAt ?? -1 });
    return count;
  }

  async pexpire(key: string, milliseconds: number) {
    const current = this.values.get(key);
    if (current) current.expiresAt = Date.now() + milliseconds;
    return current ? 1 : 0;
  }

  async pttl(key: string) {
    const current = this.values.get(key);
    if (!current) return -2;
    if (current.expiresAt < 0) return -1;
    return Math.max(current.expiresAt - Date.now(), 0);
  }
}

describe("rate limit", () => {
  it("allows requests until the Redis bucket is exhausted", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const store = new MemoryRateLimitStore();

    await expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }, store)).resolves.toMatchObject({ ok: true, remaining: 1 });
    await expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }, store)).resolves.toMatchObject({ ok: true, remaining: 0 });
    await expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }, store)).resolves.toMatchObject({ ok: false, remaining: 0 });
  });

  it("falls back to memory when Redis is unavailable", async () => {
    const key = `fallback:${crypto.randomUUID()}`;
    const store = {
      incr: async () => {
        throw new Error("redis unavailable");
      },
      pexpire: async () => 0,
      pttl: async () => 0,
    };

    await expect(checkRateLimit(key, { limit: 1, windowMs: 60_000 }, store)).resolves.toMatchObject({ ok: true });
    await expect(checkRateLimit(key, { limit: 1, windowMs: 60_000 }, store)).resolves.toMatchObject({ ok: false });
  });
});
