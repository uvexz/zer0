import { describe, expect, it } from "vitest";
import {
  deliveryMaintenanceStuckMs,
  isDueFailedDelivery,
  isStuckDelivering,
} from "./processors";
import { federationDeliverJobPayload } from "@/queue";

describe("worker maintenance processors", () => {
  it("identifies stuck delivering jobs without touching terminal states", () => {
    const now = new Date("2026-01-01T00:20:00Z");
    expect(
      isStuckDelivering({
        status: "delivering",
        updatedAt: new Date(now.getTime() - deliveryMaintenanceStuckMs),
      }, now),
    ).toBe(true);
    expect(
      isStuckDelivering({
        status: "delivered",
        updatedAt: new Date(now.getTime() - deliveryMaintenanceStuckMs * 2),
      }, now),
    ).toBe(false);
  });

  it("only retries failed deliveries whose retry time is due", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isDueFailedDelivery({ status: "failed", nextRetryAt: now }, now)).toBe(true);
    expect(
      isDueFailedDelivery({
        status: "failed",
        nextRetryAt: new Date(now.getTime() + 1),
      }, now),
    ).toBe(false);
    expect(isDueFailedDelivery({ status: "dead", nextRetryAt: now }, now)).toBe(false);
  });

  it("builds retry payloads without requiring a recipient actor id", () => {
    expect(federationDeliverJobPayload({
      deliveryJobId: "delivery_1",
      activityId: "activity_1",
    })).toEqual({
      deliveryJobId: "delivery_1",
      activityId: "activity_1",
    });
  });
});
