import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { actors, profiles, user } from "@/db/schema";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";

export async function getProfileByUsername(username: string) {
  const [row] = await db
    .select({ profile: profiles, account: user, actor: actors })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .leftJoin(actors, and(eq(actors.userId, user.id), eq(actors.type, "local")))
    .where(eq(profiles.username, username))
    .limit(1);

  return row ?? null;
}

export async function ensureLocalActor(userId: string) {
  const [existing] = await db
    .select()
    .from(actors)
    .where(and(eq(actors.userId, userId), eq(actors.type, "local")))
    .limit(1);

  if (existing) return existing;

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) throw new Error("Profile not found.");

  const actorUri = `${env.APP_ORIGIN}/users/${profile.username}`;
  const [actor] = await db
    .insert(actors)
    .values({
      id: createId("actor"),
      type: "local",
      userId,
      handle: profile.username,
      domain: new URL(env.APP_ORIGIN).host,
      uri: actorUri,
      inboxUrl: `${actorUri}/inbox`,
      outboxUrl: `${actorUri}/outbox`,
      followersUrl: `${actorUri}/followers`,
      followingUrl: `${actorUri}/following`,
      preferredUsername: profile.username,
      name: profile.displayName,
      summary: profile.bio,
      avatarUrl: profile.avatarUrl,
      headerUrl: profile.headerUrl,
    })
    .returning();

  return actor;
}
