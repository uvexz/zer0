import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountHandleCollapsible } from "@/components/account-handle-collapsible";
import { AppShell, PublicAppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/kumo";
import { ZostCard } from "@/components/zost-card";
import { db } from "@/db";
import { actors, follows } from "@/db/schema";
import {
  ensureLocalActor,
  getRemoteActorByHandle,
} from "@/features/accounts/queries";
import { getSession } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { getProfileByUsername } from "@/features/accounts/queries";
import { followActorAction, unfollowActorAction } from "@/features/federation/actions";
import { getActorProfilePosts, getProfilePosts } from "@/features/posts/queries";
import { env } from "@/lib/env";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).replace(/^@/, "");
  if (parseRemoteHandle(username)) return {};

  const profileRow = await getProfileByUsername(username);
  if (!profileRow || profileRow.profile.disabledAt || profileRow.actor?.blockedAt) return {};

  return {
    alternates: {
      canonical: `${env.APP_ORIGIN}/@${profileRow.profile.username}`,
      types: {
        "application/activity+json": `${env.APP_ORIGIN}/users/${profileRow.profile.username}`,
      },
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).replace(/^@/, "");
  const session = await getSession();
  const remoteHandle = parseRemoteHandle(username);
  if (remoteHandle) {
    return (
      <RemoteProfilePage
        handle={remoteHandle.handle}
        domain={remoteHandle.domain}
        viewerUserId={session?.user.id}
      />
    );
  }

  const profileRow = await getProfileByUsername(username);
  if (!profileRow) notFound();
  if (profileRow.profile.disabledAt || profileRow.actor?.blockedAt) notFound();

  const posts = await getProfilePosts(username, session?.user.id);

  if (!session) {
    return (
      <PublicAppShell>
        <ProfileHeader profile={profileRow.profile} />
        {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
      </PublicAppShell>
    );
  }

  const viewer = await requireUser();
  const localActor = await ensureLocalActor(session.user.id);
  const targetActor = profileRow.actor;
  const [follow] = targetActor
    ? await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerActorId, localActor.id),
            eq(follows.followeeActorId, targetActor.id),
          ),
        )
        .limit(1)
    : [];

  return (
    <AppShell profile={viewer.profile}>
      <ProfileHeader
        profile={profileRow.profile}
        actorUri={targetActor?.uri}
        followState={follow?.state}
        canFollow={Boolean(targetActor && targetActor.id !== localActor.id)}
      />
      {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
    </AppShell>
  );
}

async function RemoteProfilePage({
  handle,
  domain,
  viewerUserId,
}: {
  handle: string;
  domain: string;
  viewerUserId?: string;
}) {
  const actor = await getRemoteActorByHandle(handle, domain);
  if (!actor) notFound();
  if (actor.blockedAt) notFound();

  const posts = await getActorProfilePosts(actor.id, viewerUserId);
  const session = await getSession();
  if (!session) {
    return (
      <PublicAppShell>
        <RemoteProfileHeader actor={actor} />
        {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
      </PublicAppShell>
    );
  }

  const viewer = await requireUser();
  const localActor = await ensureLocalActor(session.user.id);
  const [follow] = await db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.followerActorId, localActor.id),
        eq(follows.followeeActorId, actor.id),
      ),
    )
    .limit(1);

  return (
    <AppShell profile={viewer.profile}>
      <RemoteProfileHeader
        actor={actor}
        followState={follow?.state}
        canFollow={actor.id !== localActor.id}
      />
      {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
    </AppShell>
  );
}

function ProfileHeader({
  profile,
  actorUri,
  followState,
  canFollow = false,
}: {
  profile: Awaited<ReturnType<typeof getProfileByUsername>>["profile"];
  actorUri?: string;
  followState?: string;
  canFollow?: boolean;
}) {
  const isFollowing = followState === "accepted" || followState === "pending";
  const fullHandle = `@${profile.username}@${new URL(env.APP_ORIGIN).host}`;

  return (
    <header className="border-b border-zinc-200 p-4">
      {profile.headerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.headerUrl} alt="" className="h-28 w-full rounded-md bg-zinc-100 object-cover" />
      ) : (
        <div className="h-28 rounded-md bg-zinc-100" />
      )}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar src={profile.avatarUrl} alt="" size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{profile.displayName}</h1>
            <AccountHandleCollapsible displayHandle={`@${profile.username}`} fullHandle={fullHandle} />
          </div>
        </div>
        {canFollow && actorUri ? (
          <form action={isFollowing ? unfollowActorAction : followActorAction}>
            <input type="hidden" name="actorUri" value={actorUri} />
            <Button type="submit" variant={isFollowing ? "secondary" : "primary"} size="sm">
              {followState === "pending" ? "Pending" : isFollowing ? "Unfollow" : "Follow"}
            </Button>
          </form>
        ) : null}
      </div>
      <div>
        {profile.bio ? <p className="mt-3 whitespace-pre-wrap text-sm">{profile.bio}</p> : null}
      </div>
    </header>
  );
}

function RemoteProfileHeader({
  actor,
  followState,
  canFollow = false,
}: {
  actor: typeof actors.$inferSelect;
  followState?: string;
  canFollow?: boolean;
}) {
  const isFollowing = followState === "accepted" || followState === "pending";
  const fullHandle = `@${actor.handle}@${actor.domain}`;

  return (
    <header className="border-b border-zinc-200 p-4">
      {actor.headerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={actor.headerUrl} alt="" className="h-28 w-full rounded-md bg-zinc-100 object-cover" />
      ) : (
        <div className="h-28 rounded-md bg-zinc-100" />
      )}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar src={actor.avatarUrl} alt="" size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{actor.name ?? actor.preferredUsername}</h1>
            <AccountHandleCollapsible displayHandle={fullHandle} fullHandle={fullHandle} />
          </div>
        </div>
        {canFollow ? (
          <form action={isFollowing ? unfollowActorAction : followActorAction}>
            <input type="hidden" name="actorUri" value={actor.uri} />
            <Button type="submit" variant={isFollowing ? "secondary" : "primary"} size="sm">
              {followState === "pending" ? "Pending" : isFollowing ? "Unfollow" : "Follow"}
            </Button>
          </form>
        ) : null}
      </div>
      {actor.summary ? (
        <div
          className="prose prose-zinc mt-3 max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: actor.summary }}
        />
      ) : null}
      <a href={actor.uri} className="mt-3 inline-block text-xs text-zinc-500 hover:text-zinc-900">
        View original profile
      </a>
    </header>
  );
}

function parseRemoteHandle(value: string) {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return null;
  const handle = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (!handle || !domain) return null;
  return { handle, domain };
}
