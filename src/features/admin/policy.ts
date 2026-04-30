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

export const deliveryStatusFilters = ["queued", "delivering", "delivered", "failed", "dead"] as const;
export type DeliveryStatusFilter = (typeof deliveryStatusFilters)[number];

export function parseDeliveryStatusFilter(value: unknown): DeliveryStatusFilter | null {
  return typeof value === "string" && deliveryStatusFilters.includes(value as DeliveryStatusFilter)
    ? value as DeliveryStatusFilter
    : null;
}

export function isDeliveryRetryableStatus(status: string) {
  return status === "failed" || status === "dead";
}

export function formatAuditMetadataPreview(metadata: unknown) {
  if (metadata === null || metadata === undefined) return null;
  return JSON.stringify(metadata);
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
