import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { Badge, Button, LayerCard } from "@/components/kumo";
import { db } from "@/db";
import { actors, follows } from "@/db/schema";
import { actorProfileHref, ensureLocalActor } from "@/features/accounts/queries";
import { updateFederationSettingsAction } from "@/features/accounts/actions";
import { requireUser } from "@/features/auth/guards";
import { approveFollowerAction, rejectFollowerAction } from "@/features/federation/actions";
import type { ZostVisibility } from "@/features/posts/types";
import { env } from "@/lib/env";
import { and, desc, eq } from "drizzle-orm";
import { SettingsNav } from "../settings-nav";

export const dynamic = "force-dynamic";

export default async function FederationSettingsPage() {
  const { session, profile } = await requireUser();
  const actor = await ensureLocalActor(session.user.id);
  const host = new URL(env.APP_ORIGIN).host;
  const handle = `@${profile.username}@${host}`;
  const pendingFollowers = await db
    .select({ follow: follows, actor: actors })
    .from(follows)
    .innerJoin(actors, eq(actors.id, follows.followerActorId))
    .where(and(eq(follows.followeeActorId, actor.id), eq(follows.state, "pending")))
    .orderBy(desc(follows.updatedAt))
    .limit(50);

  const endpoints = [
    { label: "Actor", value: actor.uri },
    { label: "Inbox", value: actor.inboxUrl },
    { label: "Outbox", value: actor.outboxUrl },
    { label: "Followers", value: actor.followersUrl },
    { label: "Following", value: actor.followingUrl },
    { label: "Liked", value: `${actor.uri}/liked` },
  ];

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Federation</h1>
      </header>
      <SettingsNav current="/settings/federation" />
      <div className="max-w-2xl space-y-4 p-4">
        <LayerCard className="p-4">
          <div className="text-sm text-zinc-500">Fediverse address</div>
          <div className="mt-1 font-mono text-sm font-medium">{handle}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>ActivityPub</Badge>
            <Badge>{profile.isDiscoverable ? "Discoverable" : "Not discoverable"}</Badge>
            <Badge>{profile.manuallyApprovesFollowers ? "Manual follow approval on" : "Manual follow approval off"}</Badge>
          </div>
        </LayerCard>

        <LayerCard className="p-4">
          <form action={updateFederationSettingsAction} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Federation defaults</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Direct zosts are limited-recipient federation, not encrypted private messages.
              </p>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-900">Default zost visibility</span>
              <select
                name="defaultZostVisibility"
                defaultValue={profile.defaultZostVisibility}
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="isDiscoverable"
                defaultChecked={profile.isDiscoverable}
                className="mt-1 size-4 rounded border-zinc-300"
              />
              <span>
                <span className="block font-medium text-zinc-900">Discoverable profile</span>
                <span className="text-zinc-500">Advertise this actor as discoverable to compatible fediverse software.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="manuallyApprovesFollowers"
                defaultChecked={profile.manuallyApprovesFollowers}
                className="mt-1 size-4 rounded border-zinc-300"
              />
              <span>
                <span className="block font-medium text-zinc-900">Manually approve followers</span>
                <span className="text-zinc-500">New follow requests stay pending until approved here.</span>
              </span>
            </label>

            <Button type="submit" variant="primary">Save federation settings</Button>
          </form>
        </LayerCard>

        <LayerCard className="p-4">
          <h2 className="text-sm font-semibold">Endpoints</h2>
          <dl className="mt-3 divide-y divide-zinc-200 text-sm">
            {endpoints.map((endpoint) => (
              <div key={endpoint.label} className="grid gap-1 py-2 md:grid-cols-[120px_minmax(0,1fr)]">
                <dt className="text-zinc-500">{endpoint.label}</dt>
                <dd className="min-w-0 truncate font-mono text-xs text-zinc-700">
                  {endpoint.value}
                </dd>
              </div>
            ))}
          </dl>
        </LayerCard>

        <LayerCard className="p-4">
          <h2 className="text-sm font-semibold">Visibility reference</h2>
          <dl className="mt-3 divide-y divide-zinc-200 text-sm">
            <div className="grid gap-1 py-2 md:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="font-medium text-zinc-900">Public</dt>
              <dd className="text-zinc-600">Visible on public profile and delivered publicly.</dd>
            </div>
            <div className="grid gap-1 py-2 md:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="font-medium text-zinc-900">Unlisted</dt>
              <dd className="text-zinc-600">Delivered publicly without profile listing.</dd>
            </div>
            <div className="grid gap-1 py-2 md:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="font-medium text-zinc-900">Followers</dt>
              <dd className="text-zinc-600">Limited to the author and accepted followers.</dd>
            </div>
            <div className="grid gap-1 py-2 md:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="font-medium text-zinc-900">Direct</dt>
              <dd className="text-zinc-600">Limited to explicit recipients; not encrypted.</dd>
            </div>
          </dl>
        </LayerCard>

        <LayerCard className="p-4">
          <h2 className="text-sm font-semibold">Pending followers</h2>
          {pendingFollowers.length ? (
            <div className="mt-3 divide-y divide-zinc-200">
              {pendingFollowers.map(({ actor: follower }) => (
                <div key={follower.id} className="flex items-center justify-between gap-3 py-3">
                  <a href={actorProfileHref(follower)} className="flex min-w-0 items-center gap-3">
                    <Avatar src={follower.avatarUrl} alt="" size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-900">
                        {follower.name ?? follower.preferredUsername}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        @{follower.handle}{follower.type === "remote" ? `@${follower.domain}` : ""}
                      </span>
                    </span>
                  </a>
                  <div className="flex shrink-0 gap-2">
                    <form action={approveFollowerAction}>
                      <input type="hidden" name="followerActorId" value={follower.id} />
                      <Button type="submit" variant="primary" size="sm">Approve</Button>
                    </form>
                    <form action={rejectFollowerAction}>
                      <input type="hidden" name="followerActorId" value={follower.id} />
                      <Button type="submit" variant="secondary" size="sm">Reject</Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No pending follower requests.</p>
          )}
        </LayerCard>
      </div>
    </AppShell>
  );
}

const visibilityOptions: Array<{ value: ZostVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "followers", label: "Followers-only" },
  { value: "direct", label: "Direct" },
];
