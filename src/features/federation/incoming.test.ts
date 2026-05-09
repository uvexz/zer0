import { describe, expect, it } from "vitest";
import type { UnverifiedActivityReason } from "@fedify/fedify";
import { activityStreamsPublic } from "./recipient-policy";
import {
  canRemoteActorInteractWithLocalPostByPolicy,
  postLookupTargetsForReply,
  remoteActorOwnsNoteByPolicy,
  remoteNoteVisibilityFromAudience,
  responseForUnverifiedActivity,
} from "./incoming";

describe("incoming federation mapping", () => {
  it("maps remote Note audience to local visibility", () => {
    const followers = "https://remote.example/users/alice/followers";
    const recipient = "https://example.com/users/bob";

    expect(remoteNoteVisibilityFromAudience({ to: [activityStreamsPublic], cc: [followers] })).toBe("public");
    expect(remoteNoteVisibilityFromAudience({ to: [followers, recipient], cc: [activityStreamsPublic] })).toBe("unlisted");
    expect(remoteNoteVisibilityFromAudience({ to: [followers], cc: [recipient] })).toBe("followers");
    expect(remoteNoteVisibilityFromAudience({ to: [recipient], cc: [] })).toBe("direct");
  });

  it("maps local public post URLs to their canonical object URI for reply lookup", () => {
    expect(
      postLookupTargetsForReply(
        "https://example.com/@alice/zost_123",
        "https://example.com",
      ),
    ).toEqual([
      "https://example.com/@alice/zost_123",
      "https://example.com/objects/zost_123",
    ]);
    expect(
      postLookupTargetsForReply(
        "https://remote.example/notes/1",
        "https://example.com",
      ),
    ).toEqual(["https://remote.example/notes/1"]);
  });

  it("requires remote notes to belong to the signing actor and not the local origin", () => {
    const actorUri = "https://remote.example/users/alice";

    expect(
      remoteActorOwnsNoteByPolicy({
        actorUri,
        actorDomain: "remote.example",
        noteUri: "https://remote.example/notes/1",
        attributionUris: [actorUri],
        localOrigin: "https://example.com",
      }),
    ).toBe(true);
    expect(
      remoteActorOwnsNoteByPolicy({
        actorUri,
        actorDomain: "remote.example",
        noteUri: "https://example.com/objects/zost_1",
        attributionUris: [actorUri],
        localOrigin: "https://example.com",
      }),
    ).toBe(false);
    expect(
      remoteActorOwnsNoteByPolicy({
        actorUri,
        actorDomain: "remote.example",
        noteUri: "https://other.example/notes/1",
        attributionUris: [actorUri],
        localOrigin: "https://example.com",
      }),
    ).toBe(false);
    expect(
      remoteActorOwnsNoteByPolicy({
        actorUri,
        actorDomain: "remote.example",
        noteUri: "https://remote.example/notes/1",
        attributionUris: ["https://remote.example/users/bob"],
        localOrigin: "https://example.com",
      }),
    ).toBe(false);
  });

  it("limits remote interactions with protected local posts", () => {
    expect(
      canRemoteActorInteractWithLocalPostByPolicy({
        visibility: "public",
        isExplicitRecipient: false,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
    expect(
      canRemoteActorInteractWithLocalPostByPolicy({
        visibility: "followers",
        isExplicitRecipient: false,
        isAcceptedFollower: false,
      }),
    ).toBe(false);
    expect(
      canRemoteActorInteractWithLocalPostByPolicy({
        visibility: "followers",
        isExplicitRecipient: false,
        isAcceptedFollower: true,
      }),
    ).toBe(true);
    expect(
      canRemoteActorInteractWithLocalPostByPolicy({
        visibility: "direct",
        isExplicitRecipient: true,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
    expect(
      canRemoteActorInteractWithLocalPostByPolicy({
        visibility: "direct",
        isExplicitRecipient: false,
        isAcceptedFollower: true,
      }),
    ).toBe(false);
  });

  it("acknowledges unverifiable deliveries from gone key owners", () => {
    const goneReason = {
      type: "keyFetchError",
      keyId: new URL("https://remote.example/users/alice#main-key"),
      result: {
        status: 410,
        response: new Response(null, { status: 410 }),
      },
    } satisfies UnverifiedActivityReason;

    expect(responseForUnverifiedActivity(goneReason)?.status).toBe(202);
    expect(responseForUnverifiedActivity({
      ...goneReason,
      result: {
        status: 503,
        response: new Response(null, { status: 503 }),
      },
    })).toBeUndefined();
    expect(responseForUnverifiedActivity({ type: "invalidSignature" })).toBeUndefined();
  });
});
