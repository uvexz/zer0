export type TimelineReason = "author" | "follow" | "recipient";

export type TimelineTarget = {
  userId: string;
  reason: TimelineReason;
};

export function resolveTimelineTargets(input: {
  visibility: "public" | "unlisted" | "followers" | "direct";
  authorUserId?: string | null;
  acceptedFollowerUserIds: string[];
  recipientUserIds: string[];
  deletedAt?: Date | null;
  hiddenAt?: Date | null;
  authorBlockedAt?: Date | null;
}) {
  if (input.deletedAt || input.hiddenAt || input.authorBlockedAt) return [];

  const targets = new Map<string, TimelineReason>();
  const add = (userId: string | null | undefined, reason: TimelineReason) => {
    if (!userId) return;
    if (!targets.has(userId)) targets.set(userId, reason);
  };

  add(input.authorUserId, "author");

  if (input.visibility === "direct") {
    for (const userId of input.recipientUserIds) add(userId, "recipient");
  } else {
    for (const userId of input.acceptedFollowerUserIds) add(userId, "follow");
  }

  return Array.from(targets, ([userId, reason]) => ({ userId, reason }));
}
