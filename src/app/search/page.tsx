import { and, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/kumo";
import { db } from "@/db";
import { actors, follows, profiles } from "@/db/schema";
import { actorProfileHref } from "@/features/accounts/queries";
import { requireUser } from "@/features/auth/guards";
import { followActorAction, unfollowActorAction } from "@/features/federation/actions";
import { lookupRemoteActor } from "@/features/federation/remote";
import { ensureLocalActor } from "@/features/accounts/queries";
import { getPostsByHashtag } from "@/features/posts/queries";
import { ZostCard } from "@/components/zost-card";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { session, profile } = await requireUser();
  const { q = "" } = await searchParams;
  const query = q.trim();
  const hashtag = query.startsWith("#") ? query.slice(1) : "";
  const host = new URL(env.APP_ORIGIN).host;
  const results = query && !hashtag
    ? await db
        .select({ profile: profiles, actor: actors })
        .from(profiles)
        .innerJoin(actors, eq(actors.userId, profiles.userId))
        .where(or(ilike(profiles.username, `%${query}%`), ilike(profiles.displayName, `%${query}%`)))
        .limit(20)
    : [];
  const hashtagPosts = hashtag ? await getPostsByHashtag(hashtag, session.user.id) : [];
  const localActor = await ensureLocalActor(session.user.id);
  const remoteSearchLimit = checkRateLimit(`remote-search:${session.user.id}`, {
    limit: 60,
    windowMs: 15 * 60_000,
  });
  const remote =
    remoteSearchLimit.ok && query.includes("@") && !query.endsWith(`@${host}`)
      ? await lookupRemoteActor(query)
      : null;
  const remoteFollow = remote
    ? await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerActorId, localActor.id),
            eq(follows.followeeActorId, remote.actor.id),
          ),
        )
        .limit(1)
    : [];
  const localResults = await Promise.all(
    results.map(async (result) => {
      const [follow] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerActorId, localActor.id),
            eq(follows.followeeActorId, result.actor.id),
          ),
        )
        .limit(1);

      return { ...result, follow };
    }),
  );

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Search</h1>
      </header>
      <form className="border-b border-zinc-200 p-4">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search local users or paste a remote handle"
          className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
        />
      </form>
      {hashtagPosts.map((item) => (
        <ZostCard key={item.post.id} item={item} />
      ))}
      {localResults.map((item) => (
        <div key={item.profile.userId} className="flex items-center justify-between gap-4 border-b border-zinc-200 p-4">
          <Link href={`/@${item.profile.username}`} className="flex min-w-0 items-center gap-3">
            <Avatar src={item.profile.avatarUrl} alt="" size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{item.profile.displayName}</div>
              <div className="truncate text-sm text-zinc-500">@{item.profile.username}</div>
            </div>
          </Link>
          {item.actor.id !== localActor.id ? (
            <form action={item.follow?.state === "accepted" || item.follow?.state === "pending" ? unfollowActorAction : followActorAction}>
              <input type="hidden" name="actorUri" value={item.actor.uri} />
              <Button type="submit" variant="primary">
                {item.follow?.state === "pending" ? "Pending" : item.follow?.state === "accepted" ? "Unfollow" : "Follow"}
              </Button>
            </form>
          ) : null}
        </div>
      ))}
      {remote ? (
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <Link href={actorProfileHref(remote.actor)} className="flex min-w-0 items-center gap-3">
            <Avatar src={remote.actor.avatarUrl} alt="" size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{remote.actor.name ?? remote.actor.preferredUsername}</div>
              <div className="truncate text-sm text-zinc-500">
                @{remote.actor.handle}@{remote.actor.domain}
              </div>
            </div>
          </Link>
          <form action={remoteFollow[0]?.state === "accepted" || remoteFollow[0]?.state === "pending" ? unfollowActorAction : followActorAction}>
            <input type="hidden" name="actorUri" value={remote.actor.uri} />
            <Button type="submit" variant="primary">
              {remoteFollow[0]?.state === "pending" ? "Pending" : remoteFollow[0]?.state === "accepted" ? "Unfollow" : "Follow"}
            </Button>
          </form>
        </div>
      ) : null}
      {!results.length && !remote && !hashtagPosts.length && query ? (
        <div className="p-4 text-sm text-zinc-500">
          {remoteSearchLimit.ok ? "No matching local or remote actors." : "Remote search is rate limited. Try again later."}
        </div>
      ) : null}
    </AppShell>
  );
}
