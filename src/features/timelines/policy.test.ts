import { describe, expect, it } from "vitest";
import { resolveTimelineTargets } from "./policy";

describe("timeline fanout policy", () => {
  it("adds the author and accepted followers for public-like posts", () => {
    expect(
      resolveTimelineTargets({
        visibility: "followers",
        authorUserId: "author",
        acceptedFollowerUserIds: ["follower"],
        recipientUserIds: ["recipient"],
      }),
    ).toEqual([
      { userId: "author", reason: "author" },
      { userId: "follower", reason: "follow" },
    ]);
  });

  it("adds direct recipients without follower fanout", () => {
    expect(
      resolveTimelineTargets({
        visibility: "direct",
        authorUserId: "author",
        acceptedFollowerUserIds: ["follower"],
        recipientUserIds: ["recipient"],
      }),
    ).toEqual([
      { userId: "author", reason: "author" },
      { userId: "recipient", reason: "recipient" },
    ]);
  });

  it("skips hidden, deleted, or actor-blocked posts", () => {
    const base = {
      visibility: "public" as const,
      authorUserId: "author",
      acceptedFollowerUserIds: ["follower"],
      recipientUserIds: [],
    };

    expect(resolveTimelineTargets({ ...base, deletedAt: new Date() })).toEqual([]);
    expect(resolveTimelineTargets({ ...base, hiddenAt: new Date() })).toEqual([]);
    expect(resolveTimelineTargets({ ...base, authorBlockedAt: new Date() })).toEqual([]);
  });
});
