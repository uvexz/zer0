import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { proxy } from "./proxy";

describe("proxy ActivityPub negotiation", () => {
  it("rewrites friendly actor URLs when ActivityPub JSON is requested", () => {
    const response = proxy(new NextRequest("https://zer0.example/@jake", {
      headers: { accept: "application/activity+json" },
    }));

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("https://zer0.example/users/jake");
  });

  it("rewrites friendly post URLs when ActivityPub JSON is requested", () => {
    const response = proxy(new NextRequest("https://zer0.example/@jake/zost_1", {
      headers: { accept: "application/activity+json" },
    }));

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("https://zer0.example/objects/zost_1");
  });

  it("adds an ActivityPub alternate Link header for HTML post requests", () => {
    const response = proxy(new NextRequest("https://zer0.example/@jake/zost_1", {
      headers: { accept: "text/html" },
    }));

    expect(response.headers.get("link")).toBe(
      '<https://zer0.example/objects/zost_1>; rel="alternate"; type="application/activity+json"',
    );
  });

  it("adds an ActivityPub alternate Link header for HTML actor requests", () => {
    const response = proxy(new NextRequest("https://zer0.example/@jake", {
      headers: { accept: "text/html" },
    }));

    expect(response.headers.get("link")).toBe(
      '<https://zer0.example/users/jake>; rel="alternate"; type="application/activity+json"',
    );
  });
});
