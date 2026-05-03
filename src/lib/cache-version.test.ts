import { describe, expect, it, vi } from "vitest";
import { bumpCacheTags, cacheVersionKey, cacheVersionSignature, type CacheVersionStore } from "./cache-version";

class MemoryVersionStore implements CacheVersionStore {
  values = new Map<string, number>();

  async mget(...keys: string[]) {
    return keys.map((key) => {
      const value = this.values.get(key);
      return value === undefined ? null : String(value);
    });
  }

  async incr(key: string) {
    const next = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, next);
    return next;
  }
}

describe("cache version helpers", () => {
  it("uses zero for missing tag versions", async () => {
    const store = new MemoryVersionStore();

    await expect(cacheVersionSignature(["post:1", "site-settings"], store)).resolves.toEqual({
      ok: true,
      value: "post:1=0|site-settings=0",
    });
  });

  it("increments tag versions", async () => {
    const store = new MemoryVersionStore();

    await expect(bumpCacheTags(["post:1", "post:1"], store)).resolves.toBe(true);
    await expect(cacheVersionSignature(["post:1"], store)).resolves.toEqual({
      ok: true,
      value: "post:1=1",
    });
    expect(store.values.get(cacheVersionKey("post:1"))).toBe(1);
  });

  it("reports failure when Redis is unavailable", async () => {
    const store: CacheVersionStore = {
      mget: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
      incr: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
    };

    await expect(cacheVersionSignature(["post:1"], store)).resolves.toEqual({ ok: false });
    await expect(bumpCacheTags(["post:1"], store)).resolves.toBe(false);
  });
});
