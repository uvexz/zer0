import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("rate limit", () => {
  it("allows requests until the bucket is exhausted", () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(false);
  });
});
