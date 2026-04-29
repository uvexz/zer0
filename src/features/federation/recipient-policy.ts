import type { ZostVisibility } from "@/features/posts/types";

export type CreateAudience = "followers" | "explicit";
export const activityStreamsPublic = "https://www.w3.org/ns/activitystreams#Public";

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

export function createNoteAudience(input: {
  visibility: ZostVisibility;
  followersUrl?: string | null;
  recipientUris?: string[];
}) {
  const followers = input.followersUrl ? [new URL(input.followersUrl)] : [];
  const recipients = input.recipientUris?.map((uri) => new URL(uri)) ?? [];
  const publicCollection = new URL(activityStreamsPublic);

  switch (input.visibility) {
    case "public":
      return { tos: [publicCollection], ccs: followers };
    case "unlisted":
      return { tos: [publicCollection], ccs: followers };
    case "followers":
      return { tos: followers, ccs: [] };
    case "direct":
      return { tos: recipients, ccs: [] };
  }
}
