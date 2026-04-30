import { describe, expect, it } from "vitest";
import {
  deliveryMaintenanceJobId,
  federationDeliverJobPayload,
  queueNames,
  type FederationDeliverJob,
  type FederationInboxJob,
  type MaintenanceJob,
  type NotificationJob,
} from "./index";

describe("queue payload contracts", () => {
  it("keeps worker queue names and maintenance job id stable", () => {
    expect(queueNames.federationInbox).toBe("federation-inbox");
    expect(queueNames.notifications).toBe("notifications-create");
    expect(queueNames.maintenance).toBe("maintenance-cleanup");
    expect(deliveryMaintenanceJobId).toBe("delivery-maintenance");
  });

  it("accepts the worker queue payload shapes", () => {
    const inbox: FederationInboxJob = { inboxEventId: "inbox_1" };
    const delivery: FederationDeliverJob = federationDeliverJobPayload({
      deliveryJobId: "delivery_1",
      activityId: "activity_1",
    });
    const notification: NotificationJob = {
      kind: "post-author",
      postId: "post_1",
      actorId: "actor_1",
      notificationType: "like",
    };
    const maintenance: MaintenanceJob = { task: "delivery-maintenance" };

    expect(inbox.inboxEventId).toBe("inbox_1");
    expect(delivery.recipientActorId).toBeUndefined();
    expect(notification.kind).toBe("post-author");
    expect(maintenance.task).toBe("delivery-maintenance");
  });
});
