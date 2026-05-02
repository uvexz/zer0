import { describe, expect, it, vi } from "vitest";
import {
  cachedFederationGet,
  shouldCacheFederationRequest,
  type FederationResponseCacheStore,
} from "./response-cache";

class MemoryStore implements FederationResponseCacheStore {
  values = new Map<string, string>();
  ttlSeconds: number | null = null;

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async setex(key: string, seconds: number, value: string) {
    this.ttlSeconds = seconds;
    this.values.set(key, value);
    return "OK";
  }
}

describe("federation response cache", () => {
  it("serves cached public federation GET responses", async () => {
    const store = new MemoryStore();
    const request = new Request("https://zer0.example/objects/zost_1", {
      headers: { accept: "application/activity+json" },
    });
    const fetchResponse = vi.fn(async () =>
      new Response(JSON.stringify({ id: "https://zer0.example/objects/zost_1" }), {
        headers: { "content-type": "application/activity+json; charset=utf-8" },
      })
    );

    const first = await cachedFederationGet(request, fetchResponse, store);
    const second = await cachedFederationGet(request, fetchResponse, store);

    expect(fetchResponse).toHaveBeenCalledTimes(1);
    expect(first.headers.get("x-zer0-cache")).toBe("MISS");
    expect(second.headers.get("x-zer0-cache")).toBe("HIT");
    await expect(second.json()).resolves.toMatchObject({ id: "https://zer0.example/objects/zost_1" });
    expect(store.ttlSeconds).toBe(120);
  });

  it("skips signed and non-GET requests", () => {
    expect(shouldCacheFederationRequest(new Request("https://zer0.example/objects/zost_1"))).toBe(true);
    expect(shouldCacheFederationRequest(new Request("https://zer0.example/objects/zost_1", {
      headers: { signature: "keyId=\"https://remote.example#key\"" },
    }))).toBe(false);
    expect(shouldCacheFederationRequest(new Request("https://zer0.example/inbox", {
      method: "POST",
    }))).toBe(false);
  });

  it("does not store errors or non-federation responses", async () => {
    const store = new MemoryStore();
    const notFound = await cachedFederationGet(
      new Request("https://zer0.example/objects/missing"),
      async () => Response.json({ error: "Not found" }, { status: 404 }),
      store,
    );
    const html = await cachedFederationGet(
      new Request("https://zer0.example/users/alice"),
      async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      store,
    );

    expect(notFound.headers.get("x-zer0-cache")).toBeNull();
    expect(html.headers.get("x-zer0-cache")).toBeNull();
    expect(store.values.size).toBe(0);
  });

  it("falls back to origin when Redis fails", async () => {
    const store: FederationResponseCacheStore = {
      get: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
      setex: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
    };

    const response = await cachedFederationGet(
      new Request("https://zer0.example/nodeinfo/2.1"),
      async () => Response.json({ software: { name: "zer0" } }),
      store,
    );

    expect(response.headers.get("x-zer0-cache")).toBe("MISS");
    await expect(response.json()).resolves.toMatchObject({ software: { name: "zer0" } });
  });
});
