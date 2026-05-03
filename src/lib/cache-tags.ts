export const cacheTags = {
  siteSettings: "site-settings",
  localTimeline: "local-timeline",
  nodeInfo: "nodeinfo",
  post: (id: string) => `post:${id}`,
  profile: (username: string) => `profile:${username}`,
  actor: (id: string) => `actor:${id}`,
  media: (id: string) => `media:${id}`,
  followers: (actorId: string) => `followers:${actorId}`,
  following: (actorId: string) => `following:${actorId}`,
  liked: (actorId: string) => `liked:${actorId}`,
  activity: (id: string) => `activity:${id}`,
  webfinger: (username: string) => `webfinger:${username}`,
  followersCollection: (username: string) => `followers-collection:${username}`,
  followingCollection: (username: string) => `following-collection:${username}`,
  likedCollection: (username: string) => `liked-collection:${username}`,
};

export function uniqueCacheTags(tags: Array<string | null | undefined>) {
  return Array.from(new Set(tags.filter((tag): tag is string => Boolean(tag))));
}
