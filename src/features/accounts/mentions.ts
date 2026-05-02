import type { actors } from "@/db/schema";
import type { ParsedMention } from "@/lib/text";

type MentionableActor = Pick<typeof actors.$inferSelect, "handle" | "domain" | "type"> & {
  username: string | null;
};

export function isActorMentioned(actor: MentionableActor, mention: ParsedMention) {
  const handle = actor.handle.toLowerCase();
  const domain = actor.domain.toLowerCase();
  const username = actor.username?.toLowerCase() ?? null;
  const mentionHandle = mention.handle.toLowerCase();
  const mentionDomain = mention.domain?.toLowerCase() ?? null;

  if (mentionDomain) return mentionHandle === handle && mentionDomain === domain;
  return actor.type === "local" && (mentionHandle === username || mentionHandle === handle);
}
