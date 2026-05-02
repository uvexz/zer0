import { describe, expect, it } from "vitest";
import { isActorMentioned } from "./mentions";

describe("mention actor matching", () => {
  it("matches unqualified mentions only to local actors", () => {
    const mention = { handle: "ada", domain: null, text: "@ada" };

    expect(
      isActorMentioned(
        { type: "local", handle: "ada", domain: "zer0.test", username: "ada" },
        mention,
      ),
    ).toBe(true);
    expect(
      isActorMentioned(
        { type: "remote", handle: "ada", domain: "example.social", username: null },
        mention,
      ),
    ).toBe(false);
  });

  it("matches fully qualified local and remote mentions by handle and domain", () => {
    expect(
      isActorMentioned(
        { type: "remote", handle: "ada", domain: "example.social", username: null },
        { handle: "ada", domain: "example.social", text: "@ada@example.social" },
      ),
    ).toBe(true);
    expect(
      isActorMentioned(
        { type: "local", handle: "ada", domain: "zer0.test", username: "ada" },
        { handle: "ada", domain: "zer0.test", text: "@ada@zer0.test" },
      ),
    ).toBe(true);
  });
});
