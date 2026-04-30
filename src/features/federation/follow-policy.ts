import type { followStateEnum } from "@/db/schema";

export type FollowState = (typeof followStateEnum.enumValues)[number];

export function followStateForApprovalPolicy(manuallyApprovesFollowers: boolean): FollowState {
  return manuallyApprovesFollowers ? "pending" : "accepted";
}

export function canModeratePendingFollower(input: {
  viewerActorId: string;
  followeeActorId: string;
  state: FollowState;
}) {
  return input.viewerActorId === input.followeeActorId && input.state === "pending";
}

