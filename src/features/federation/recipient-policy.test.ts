import { describe, expect, it } from "vitest";
import { createAudienceForVisibility, objectActivityAudience } from "./recipient-policy";

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
});
