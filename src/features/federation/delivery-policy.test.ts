import { describe, expect, it } from "vitest";
import { maxDeliveryAttempts, nextFailureStatus, nextRetryAt } from "./delivery-policy";

describe("delivery retry policy", () => {
  it("marks early failures retryable", () => {
    expect(nextFailureStatus(0)).toBe("failed");
    expect(nextFailureStatus(maxDeliveryAttempts - 2)).toBe("failed");
  });

  it("marks the final failure dead", () => {
    expect(nextFailureStatus(maxDeliveryAttempts - 1)).toBe("dead");
  });

  it("returns a next retry time only for retryable failures", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(nextRetryAt(0, now)?.getTime()).toBe(now + 60_000);
    expect(nextRetryAt(maxDeliveryAttempts - 1, now)).toBeNull();
  });
});
