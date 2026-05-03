import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({
  versionOk: true,
  versionValue: "site-settings=0",
  entries: new Map<string, unknown>(),
}));

vi.mock("./cache-version", () => ({
  cacheVersionSignature: vi.fn(async () =>
    cacheState.versionOk
      ? { ok: true, value: cacheState.versionValue }
      : { ok: false },
  ),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(load: () => Promise<T>, keys: string[]) =>
    async () => {
      const key = keys.join("|");
      if (!cacheState.entries.has(key)) {
        cacheState.entries.set(key, await load());
      }
      return cacheState.entries.get(key) as T;
    },
}));

describe("cachedRead", () => {
  beforeEach(() => {
    cacheState.versionOk = true;
    cacheState.versionValue = "site-settings=0";
    cacheState.entries.clear();
  });

  it("hits the same cached read for the same tag version", async () => {
    const { cachedRead } = await import("./cached-read");
    const load = vi.fn(async () => ({ value: crypto.randomUUID() }));

    const first = await cachedRead({ key: "site-settings", tags: ["site-settings"], load });
    const second = await cachedRead({ key: "site-settings", tags: ["site-settings"], load });

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("reads fresh after a version bump", async () => {
    const { cachedRead } = await import("./cached-read");
    const load = vi.fn(async () => ({ value: crypto.randomUUID() }));

    const first = await cachedRead({ key: "site-settings", tags: ["site-settings"], load });
    cacheState.versionValue = "site-settings=1";
    const second = await cachedRead({ key: "site-settings", tags: ["site-settings"], load });

    expect(load).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it("bypasses the cache when tag versions are unavailable", async () => {
    const { cachedRead } = await import("./cached-read");
    cacheState.versionOk = false;
    const load = vi.fn(async () => ({ value: crypto.randomUUID() }));

    await cachedRead({ key: "site-settings", tags: ["site-settings"], load });
    await cachedRead({ key: "site-settings", tags: ["site-settings"], load });

    expect(load).toHaveBeenCalledTimes(2);
  });
});
