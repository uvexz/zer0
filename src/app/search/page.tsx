import { and, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/kumo";
import { db } from "@/db";
import { follows, profiles } from "@/db/schema";
import { requireUser } from "@/features/auth/guards";
import { followActorAction, unfollowActorAction } from "@/features/federation/actions";
import { lookupRemoteActor } from "@/features/federation/remote";
import { ensureLocalActor } from "@/features/accounts/queries";
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
  const host = new URL(env.APP_ORIGIN).host;
  const results = query
    ? await db
        .select()
        .from(profiles)
        .where(or(ilike(profiles.username, `%${query}%`), ilike(profiles.displayName, `%${query}%`)))
        .limit(20)
    : [];
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
      {results.map((item) => (
        <Link key={item.userId} href={`/@${item.username}`} className="block border-b border-zinc-200 p-4">
          <div className="font-medium">{item.displayName}</div>
          <div className="text-sm text-zinc-500">@{item.username}</div>
        </Link>
      ))}
      {remote ? (
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <div>
            <div className="font-medium">{remote.actor.name ?? remote.actor.preferredUsername}</div>
            <div className="text-sm text-zinc-500">
              @{remote.actor.handle}@{remote.actor.domain}
            </div>
          </div>
          <form action={remoteFollow[0]?.state === "accepted" || remoteFollow[0]?.state === "pending" ? unfollowActorAction : followActorAction}>
            <input type="hidden" name="actorUri" value={remote.actor.uri} />
            <Button type="submit" variant="primary">
              {remoteFollow[0]?.state === "pending" ? "Pending" : remoteFollow[0]?.state === "accepted" ? "Unfollow" : "Follow"}
            </Button>
          </form>
        </div>
      ) : null}
      {!results.length && !remote && query ? (
        <div className="p-4 text-sm text-zinc-500">
          {remoteSearchLimit.ok ? "No matching local or remote actors." : "Remote search is rate limited. Try again later."}
        </div>
      ) : null}
    </AppShell>
  );
}
