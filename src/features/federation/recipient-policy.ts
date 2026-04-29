import type { ZostVisibility } from "@/features/posts/types";

export type CreateAudience = "followers" | "explicit";

export function createAudienceForVisibility(visibility: ZostVisibility): CreateAudience {
  return visibility === "direct" ? "explicit" : "followers";
}

export function objectActivityAudience(input: {
  type: string;
  actorOwnsObject: boolean;
}) {
  if (input.type === "Delete" && input.actorOwnsObject) return "followers";
  return "object-author";
}
