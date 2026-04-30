import { describe, expect, it } from "vitest";
import { deliveryInboxForActor, isRemoteActorDeliverable, uniqueActorsByDeliveryInbox } from "./outgoing";

describe("outgoing federation delivery", () => {
  it("prefers shared inboxes and deduplicates recipients by delivery target", () => {
    const sharedInboxUrl = "https://remote.example/inbox";
    const actors = [
      {
        id: "actor_1",
        inboxUrl: "https://remote.example/users/alice/inbox",
        sharedInboxUrl,
      },
      {
        id: "actor_2",
        inboxUrl: "https://remote.example/users/bob/inbox",
        sharedInboxUrl,
      },
      {
        id: "actor_3",
        inboxUrl: "https://other.example/users/cam/inbox",
        sharedInboxUrl: null,
      },
    ];

    expect(deliveryInboxForActor(actors[0])).toBe(sharedInboxUrl);
    expect(uniqueActorsByDeliveryInbox(actors).map((actor) => actor.id)).toEqual([
      "actor_1",
      "actor_3",
    ]);
  });

  it("skips blocked or local actors for remote delivery", () => {
    expect(isRemoteActorDeliverable({
      type: "remote",
      blockedAt: null,
      inboxUrl: "https://remote.example/inbox",
      sharedInboxUrl: null,
    })).toBe(true);
    expect(isRemoteActorDeliverable({
      type: "remote",
      blockedAt: new Date(),
      inboxUrl: "https://remote.example/inbox",
      sharedInboxUrl: null,
    })).toBe(false);
    expect(isRemoteActorDeliverable({
      type: "local",
      blockedAt: null,
      inboxUrl: "https://example.com/users/alice/inbox",
      sharedInboxUrl: null,
    })).toBe(false);
  });
});
