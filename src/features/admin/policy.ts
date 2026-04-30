export function canToggleUserDisabled(input: {
  currentUserId: string;
  targetUserId: string;
  targetIsAdmin: boolean;
}) {
  return input.currentUserId !== input.targetUserId && !input.targetIsAdmin;
}

export function canModerateActor(input: {
  actorType: "local" | "remote";
}) {
  return input.actorType === "remote";
}

export function normalizeDomainBlock(input: string) {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function shouldShowActor(input: {
  actorBlockedAt?: Date | null;
  profileDisabledAt?: Date | null;
}) {
  return !input.actorBlockedAt && !input.profileDisabledAt;
}

export function shouldShowPost(input: {
  deletedAt?: Date | null;
  hiddenAt?: Date | null;
}) {
  return !input.deletedAt && !input.hiddenAt;
}
