import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Badge, Button } from "@/components/kumo";
import { db } from "@/db";
import { actors, posts, profiles } from "@/db/schema";
import {
  blockActorAction,
  hidePostAction,
  restorePostAction,
  unblockActorAction,
} from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const { profile } = await requireAdmin();
  const recentPosts = await db
    .select({ post: posts, actor: actors, profile: profiles })
    .from(posts)
    .innerJoin(actors, eq(actors.id, posts.authorActorId))
    .leftJoin(profiles, eq(profiles.userId, actors.userId))
    .orderBy(desc(posts.publishedAt))
    .limit(50);
  const remoteActors = await db
    .select()
    .from(actors)
    .where(eq(actors.type, "remote"))
    .orderBy(desc(actors.updatedAt))
    .limit(50);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Moderation</h1>
      </header>
      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Recent posts</h2>
        <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {recentPosts.map((row) => (
            <div key={row.post.id} className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.profile?.username ?? `${row.actor.handle}@${row.actor.domain}`}</span>
                  <Badge variant="secondary">{row.post.visibility}</Badge>
                  {row.post.hiddenAt ? <Badge variant="secondary">hidden</Badge> : null}
                </div>
                <div className="line-clamp-2 text-zinc-700">{row.post.contentText}</div>
                <div className="mt-1 truncate text-xs text-zinc-500">{row.post.uri}</div>
              </div>
              <form action={row.post.hiddenAt ? restorePostAction : hidePostAction}>
                <input type="hidden" name="postId" value={row.post.id} />
                <Button
                  type="submit"
                  variant={row.post.hiddenAt ? "secondary" : "secondary-destructive"}
                  size="sm"
                >
                  {row.post.hiddenAt ? "Restore" : "Hide"}
                </Button>
              </form>
            </div>
          ))}
        </div>
      </section>
      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Remote actors</h2>
        <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {remoteActors.map((actor) => (
            <div key={actor.id} className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{actor.name ?? actor.preferredUsername}</span>
                  <span className="text-zinc-500">@{actor.handle}@{actor.domain}</span>
                  {actor.blockedAt ? <Badge variant="secondary">blocked</Badge> : null}
                </div>
                <div className="truncate text-xs text-zinc-500">{actor.uri}</div>
              </div>
              <form action={actor.blockedAt ? unblockActorAction : blockActorAction}>
                <input type="hidden" name="actorId" value={actor.id} />
                <Button
                  type="submit"
                  variant={actor.blockedAt ? "secondary" : "secondary-destructive"}
                  size="sm"
                >
                  {actor.blockedAt ? "Unblock" : "Block"}
                </Button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
