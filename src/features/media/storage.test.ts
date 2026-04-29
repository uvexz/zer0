import { describe, expect, it } from "vitest";
import {
  createStorageAdapter,
  finalizedMediaKey,
  isPublicMediaKey,
  joinPublicUrl,
  mediaKeyPrefixForVisibility,
  pendingMediaKey,
} from "./storage";

describe("media storage policy", () => {
  it("selects the local storage adapter by default", () => {
    expect(createStorageAdapter("local").driver).toBe("local");
  });

  it("maps visibility to public or protected object prefixes", () => {
    expect(mediaKeyPrefixForVisibility("public")).toBe("public");
    expect(mediaKeyPrefixForVisibility("unlisted")).toBe("public");
    expect(mediaKeyPrefixForVisibility("followers")).toBe("protected");
    expect(mediaKeyPrefixForVisibility("direct")).toBe("protected");
  });

  it("builds pending and finalized keys", () => {
    expect(pendingMediaKey("user_1", "media_1", "jpg")).toBe("pending/user_1/media_1.jpg");
    expect(
      finalizedMediaKey({
        ownerUserId: "user_1",
        mediaId: "media_1",
        extension: "jpg",
        visibility: "direct",
      }),
    ).toBe("protected/user_1/media_1.jpg");
  });

  it("only treats public-prefixed keys as CDN-addressable", () => {
    expect(isPublicMediaKey("public/user_1/media_1.jpg")).toBe(true);
    expect(isPublicMediaKey("protected/user_1/media_1.jpg")).toBe(false);
    expect(joinPublicUrl("https://cdn.example.com/media/", "public/u/m 1.jpg")).toBe(
      "https://cdn.example.com/media/public/u/m%201.jpg",
    );
  });
});
