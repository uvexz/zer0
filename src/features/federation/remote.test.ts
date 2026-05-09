import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./remote";

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  },
}));

describe("remote fetch safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects redirects to private or local hosts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/activity" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://remote.example/activity")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows safe redirects manually", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://cdn.remote.example/activity" },
      }))
      .mockResolvedValueOnce(Response.json({ id: "https://cdn.remote.example/activity" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://remote.example/activity")).resolves.toEqual({
      id: "https://cdn.remote.example/activity",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
