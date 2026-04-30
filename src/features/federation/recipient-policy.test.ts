import { describe, expect, it } from "vitest";
import {
  createAudienceForVisibility,
  createNoteAudience,
  objectActivityAudience,
} from "./recipient-policy";

describe("federation recipient policy", () => {
  it("fans public, unlisted, and followers-only creates to accepted followers", () => {
    expect(createAudienceForVisibility("public")).toBe("followers");
    expect(createAudienceForVisibility("unlisted")).toBe("followers");
    expect(createAudienceForVisibility("followers")).toBe("followers");
  });

  it("limits direct creates to explicit recipients", () => {
    expect(createAudienceForVisibility("direct")).toBe("explicit");
  });

  it("fans local deletes to followers and remote object activities to the object author", () => {
    expect(objectActivityAudience({ type: "Delete", actorOwnsObject: true })).toBe("followers");
    expect(objectActivityAudience({ type: "Like", actorOwnsObject: false })).toBe("object-author");
    expect(objectActivityAudience({ type: "Announce", actorOwnsObject: false })).toBe("object-author");
  });

  it("builds ActivityPub note audiences for each visibility", () => {
    const followersUrl = "https://example.com/users/alice/followers";
    const recipientUri = "https://example.com/users/bob";

    expect(createNoteAudience({ visibility: "public", followersUrl }).tos.map(String)).toEqual([
      "https://www.w3.org/ns/activitystreams#Public",
    ]);
    expect(
      createNoteAudience({
        visibility: "public",
        followersUrl,
        recipientUris: [recipientUri],
      }).ccs.map(String),
    ).toEqual([followersUrl, recipientUri]);
    const unlisted = createNoteAudience({
      visibility: "unlisted",
      followersUrl,
      recipientUris: [recipientUri],
    });
    expect(unlisted.tos.map(String)).toEqual([followersUrl, recipientUri]);
    expect(unlisted.ccs.map(String)).toEqual([
      "https://www.w3.org/ns/activitystreams#Public",
    ]);
    const followers = createNoteAudience({
      visibility: "followers",
      followersUrl,
      recipientUris: [recipientUri],
    });
    expect(followers.tos.map(String)).toEqual([followersUrl]);
    expect(followers.ccs.map(String)).toEqual([recipientUri]);
    expect(
      createNoteAudience({
        visibility: "direct",
        followersUrl,
        recipientUris: [recipientUri],
      }).tos.map(String),
    ).toEqual([recipientUri]);
  });
});
