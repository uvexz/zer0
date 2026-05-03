import { describe, expect, it } from "vitest";
import { activityStreamsPublic } from "./recipient-policy";
import { postLookupTargetsForReply, remoteNoteVisibilityFromAudience } from "./incoming";

describe("incoming federation mapping", () => {
  it("maps remote Note audience to local visibility", () => {
    const followers = "https://remote.example/users/alice/followers";
    const recipient = "https://example.com/users/bob";

    expect(remoteNoteVisibilityFromAudience({ to: [activityStreamsPublic], cc: [followers] })).toBe("public");
    expect(remoteNoteVisibilityFromAudience({ to: [followers, recipient], cc: [activityStreamsPublic] })).toBe("unlisted");
    expect(remoteNoteVisibilityFromAudience({ to: [followers], cc: [recipient] })).toBe("followers");
    expect(remoteNoteVisibilityFromAudience({ to: [recipient], cc: [] })).toBe("direct");
  });

  it("maps local public post URLs to their canonical object URI for reply lookup", () => {
    expect(
      postLookupTargetsForReply(
        "https://example.com/@alice/zost_123",
        "https://example.com",
      ),
    ).toEqual([
      "https://example.com/@alice/zost_123",
      "https://example.com/objects/zost_123",
    ]);
    expect(
      postLookupTargetsForReply(
        "https://remote.example/notes/1",
        "https://example.com",
      ),
    ).toEqual(["https://remote.example/notes/1"]);
  });
});
