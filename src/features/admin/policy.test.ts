import { describe, expect, it } from "vitest";
import {
  canModerateActor,
  canToggleUserDisabled,
  normalizeDomainBlock,
  shouldShowActor,
  shouldShowPost,
} from "./policy";

describe("admin moderation policy", () => {
  it("only allows disabling non-admin users other than the current admin", () => {
    expect(canToggleUserDisabled({
      currentUserId: "admin",
      targetUserId: "user",
      targetIsAdmin: false,
    })).toBe(true);
    expect(canToggleUserDisabled({
      currentUserId: "admin",
      targetUserId: "admin",
      targetIsAdmin: false,
    })).toBe(false);
    expect(canToggleUserDisabled({
      currentUserId: "admin",
      targetUserId: "other_admin",
      targetIsAdmin: true,
    })).toBe(false);
  });

  it("limits actor moderation to remote actors", () => {
    expect(canModerateActor({ actorType: "remote" })).toBe(true);
    expect(canModerateActor({ actorType: "local" })).toBe(false);
  });

  it("normalizes domain block input", () => {
    expect(normalizeDomainBlock(" HTTPS://Example.Social/path ")).toBe("example.social");
  });

  it("hides blocked actors, disabled profiles, and hidden posts", () => {
    expect(shouldShowActor({ actorBlockedAt: null, profileDisabledAt: null })).toBe(true);
    expect(shouldShowActor({ actorBlockedAt: new Date(), profileDisabledAt: null })).toBe(false);
    expect(shouldShowActor({ actorBlockedAt: null, profileDisabledAt: new Date() })).toBe(false);
    expect(shouldShowPost({ deletedAt: null, hiddenAt: null })).toBe(true);
    expect(shouldShowPost({ deletedAt: null, hiddenAt: new Date() })).toBe(false);
  });
});
