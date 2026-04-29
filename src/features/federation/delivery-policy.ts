export const maxDeliveryAttempts = 6;

export const retryDelaysMs = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export type DeliveryFailureStatus = "failed" | "dead";

export function nextFailureStatus(attemptsMade: number): DeliveryFailureStatus {
  return attemptsMade + 1 >= maxDeliveryAttempts ? "dead" : "failed";
}

export function nextRetryAt(attemptsMade: number, now = Date.now()) {
  if (nextFailureStatus(attemptsMade) === "dead") return null;

  const delay = retryDelaysMs[Math.min(attemptsMade, retryDelaysMs.length - 1)];
  return new Date(now + delay);
}
