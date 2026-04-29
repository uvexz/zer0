import { describe, expect, it } from "vitest";
import { canViewPostByPolicy } from "./visibility";

describe("post visibility policy", () => {
  it("allows public and unlisted posts without a viewer", () => {
    expect(
      canViewPostByPolicy({
        visibility: "public",
        isExplicitRecipient: false,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
    expect(
      canViewPostByPolicy({
        visibility: "unlisted",
        isExplicitRecipient: false,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
  });

  it("limits followers-only posts to the author and accepted followers", () => {
    expect(
      canViewPostByPolicy({
        visibility: "followers",
        viewerUserId: "viewer",
        authorUserId: "author",
        isExplicitRecipient: false,
        isAcceptedFollower: true,
      }),
    ).toBe(true);
    expect(
      canViewPostByPolicy({
        visibility: "followers",
        viewerUserId: "viewer",
        authorUserId: "author",
        isExplicitRecipient: true,
        isAcceptedFollower: false,
      }),
    ).toBe(false);
  });

  it("limits direct posts to the author and explicit recipients", () => {
    expect(
      canViewPostByPolicy({
        visibility: "direct",
        viewerUserId: "viewer",
        authorUserId: "author",
        isExplicitRecipient: true,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
    expect(
      canViewPostByPolicy({
        visibility: "direct",
        viewerUserId: "viewer",
        authorUserId: "author",
        isExplicitRecipient: false,
        isAcceptedFollower: true,
      }),
    ).toBe(false);
  });
});
