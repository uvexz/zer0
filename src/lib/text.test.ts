import { describe, expect, it } from "vitest";
import { parseZostText, plainTextToHtml, sanitizeRemoteHtml } from "./text";

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

describe("zost text links", () => {
  it("links hashtags, mentions, remote mentions, and URLs", () => {
    const html = plainTextToHtml("hi @Ada @bob@example.social #Zer0 https://domain.com/a?b=1", {
      origin: "https://zer0.test",
    });

    expect(html).toContain('<a href="https://zer0.test/@ada" class="mention" rel="mention">@Ada</a>');
    expect(html).toContain(
      '<a href="https://zer0.test/@bob@example.social" class="mention" rel="mention">@bob@example.social</a>',
    );
    expect(html).toContain('<a href="https://zer0.test/search?q=%23Zer0" rel="tag">#Zer0</a>');
    expect(html).toContain(
      '<a href="https://domain.com/a?b=1" rel="nofollow noopener noreferrer" target="_blank">https://domain.com/a?b=1</a>',
    );
  });

  it("does not link mentions inside URLs and keeps trailing URL punctuation outside", () => {
    const html = plainTextToHtml("see https://example.com/@ada/test, then @ada");

    expect(html).toContain(
      '<a href="https://example.com/@ada/test" rel="nofollow noopener noreferrer" target="_blank">https://example.com/@ada/test</a>,',
    );
    expect(html).toContain('<a href="/@ada" class="mention" rel="mention">@ada</a>');
  });

  it("returns deduped parsed entities for metadata", () => {
    expect(parseZostText("@Ada @ada #Zer0 #zer0 https://example.com")).toEqual({
      mentions: [{ handle: "ada", domain: null, text: "@Ada" }],
      hashtags: [{ tag: "Zer0", text: "#Zer0" }],
      urls: [{ href: "https://example.com/", text: "https://example.com" }],
    });
  });
});
