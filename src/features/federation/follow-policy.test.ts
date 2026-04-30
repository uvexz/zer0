import { describe, expect, it } from "vitest";
import { canModeratePendingFollower, followStateForApprovalPolicy } from "./follow-policy";

describe("follow approval policy", () => {
  it("accepts follows automatically unless manual approval is enabled", () => {
    expect(followStateForApprovalPolicy(false)).toBe("accepted");
    expect(followStateForApprovalPolicy(true)).toBe("pending");
  });

  it("only lets the followee moderate pending follows", () => {
    expect(canModeratePendingFollower({
      viewerActorId: "actor_1",
      followeeActorId: "actor_1",
      state: "pending",
    })).toBe(true);
    expect(canModeratePendingFollower({
      viewerActorId: "actor_2",
      followeeActorId: "actor_1",
      state: "pending",
    })).toBe(false);
    expect(canModeratePendingFollower({
      viewerActorId: "actor_1",
      followeeActorId: "actor_1",
      state: "accepted",
    })).toBe(false);
  });
});

