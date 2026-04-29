import { describe, expect, it } from "vitest";
import { sanitizeRemoteHtml } from "./text";

describe("remote HTML sanitization", () => {
  it("removes unsafe tags and event handlers", () => {
    const html = sanitizeRemoteHtml('<p onclick="x()">hi<script>alert(1)</script></p>');
    expect(html).toBe("<p>hi</p>");
  });

  it("allows safe links but strips unsafe schemes", () => {
    expect(sanitizeRemoteHtml('<a href="https://example.com">ok</a>')).toBe(
      '<a href="https://example.com">ok</a>',
    );
    expect(sanitizeRemoteHtml('<a href="javascript:alert(1)">bad</a>')).toBe("<a>bad</a>");
  });
});
