import type { profiles } from "@/db/schema";

export function actorFederationSettings(
  profile: Pick<typeof profiles.$inferSelect, "isDiscoverable" | "manuallyApprovesFollowers">,
) {
  return {
    discoverable: profile.isDiscoverable,
    manuallyApprovesFollowers: profile.manuallyApprovesFollowers,
  };
}

