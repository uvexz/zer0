import { describe, expect, it } from "vitest";
import {
  extensionForMime,
  isAllowedImageMimeType,
  resolveVariantStorageTarget,
  shouldFoldSensitiveMedia,
} from "./service";

describe("media service helpers", () => {
  it("allows the MVP image MIME types", () => {
    expect(isAllowedImageMimeType("image/jpeg")).toBe(true);
    expect(isAllowedImageMimeType("image/png")).toBe(true);
    expect(isAllowedImageMimeType("image/webp")).toBe(true);
    expect(isAllowedImageMimeType("image/gif")).toBe(true);
    expect(isAllowedImageMimeType("image/svg+xml")).toBe(false);
  });

  it("normalizes extensions from MIME types", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("application/octet-stream")).toBe("bin");
  });

  it("falls back to the original when a requested variant is missing", () => {
    expect(
      resolveVariantStorageTarget(
        { storageKey: "public/u/media.jpg", mimeType: "image/jpeg" },
        null,
      ),
    ).toEqual({ storageKey: "public/u/media.jpg", mimeType: "image/jpeg" });
    expect(
      resolveVariantStorageTarget(
        { storageKey: "public/u/media.jpg", mimeType: "image/jpeg" },
        { storageKey: "public/u/media.preview.webp", mimeType: "image/webp" },
      ),
    ).toEqual({ storageKey: "public/u/media.preview.webp", mimeType: "image/webp" });
  });

  it("folds sensitive media by default", () => {
    expect(shouldFoldSensitiveMedia(true)).toBe(true);
    expect(shouldFoldSensitiveMedia(false)).toBe(false);
  });
});
