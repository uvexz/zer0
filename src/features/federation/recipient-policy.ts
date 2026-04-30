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
  const followerRecipients = uniqueUrls([...followers, ...recipients]);

  switch (input.visibility) {
    case "public":
      return { tos: [publicCollection], ccs: followerRecipients };
    case "unlisted":
      return { tos: followerRecipients, ccs: [publicCollection] };
    case "followers":
      return { tos: followers, ccs: recipients };
    case "direct":
      return { tos: recipients, ccs: [] };
  }
}

function uniqueUrls(urls: URL[]) {
  return Array.from(new Map(urls.map((url) => [url.href, url])).values());
}
