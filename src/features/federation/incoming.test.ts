import { describe, expect, it } from "vitest";
import { activityStreamsPublic } from "./recipient-policy";
import { remoteNoteVisibilityFromAudience } from "./incoming";

describe("incoming federation mapping", () => {
  it("maps remote Note audience to local visibility", () => {
    const followers = "https://remote.example/users/alice/followers";
    const recipient = "https://example.com/users/bob";

    expect(remoteNoteVisibilityFromAudience({ to: [activityStreamsPublic], cc: [followers] })).toBe("public");
    expect(remoteNoteVisibilityFromAudience({ to: [followers, recipient], cc: [activityStreamsPublic] })).toBe("unlisted");
    expect(remoteNoteVisibilityFromAudience({ to: [followers], cc: [recipient] })).toBe("followers");
    expect(remoteNoteVisibilityFromAudience({ to: [recipient], cc: [] })).toBe("direct");
  });
});
