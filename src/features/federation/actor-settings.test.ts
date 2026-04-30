import { describe, expect, it } from "vitest";
import { actorFederationSettings } from "./actor-settings";

describe("actor federation settings", () => {
  it("maps profile settings into ActivityPub actor flags", () => {
    expect(actorFederationSettings({
      isDiscoverable: false,
      manuallyApprovesFollowers: true,
    })).toEqual({
      discoverable: false,
      manuallyApprovesFollowers: true,
    });
  });
});

