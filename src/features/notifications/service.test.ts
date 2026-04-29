import { describe, expect, it } from "vitest";
import { notificationDedupeKey, shouldCreateNotification } from "./service";

describe("notification helpers", () => {
  it("skips self notifications and missing targets", () => {
    expect(shouldCreateNotification({ userId: "alice", actorUserId: "alice" })).toBe(false);
    expect(shouldCreateNotification({ userId: null, actorUserId: "alice" })).toBe(false);
    expect(shouldCreateNotification({ userId: "alice", actorUserId: "bob" })).toBe(true);
  });

  it("uses stable identity for duplicate notification checks", () => {
    expect(
      notificationDedupeKey({
        userId: "alice",
        actorId: "actor_bob",
        type: "like",
        postId: "post_1",
      }),
    ).toBe("alice:actor_bob:like:post_1");
  });
});
