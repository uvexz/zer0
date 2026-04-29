import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { actors, notifications, posts } from "@/db/schema";
import { requireUser } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { session, profile } = await requireUser();
  const rows = await db
    .select({ notification: notifications, actor: actors, post: posts })
    .from(notifications)
    .leftJoin(actors, eq(actors.id, notifications.actorId))
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Notifications</h1>
      </header>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.notification.id} className="border-b border-zinc-200 px-4 py-3 text-sm">
            <span className="font-medium">{row.actor?.name ?? row.actor?.handle ?? "Someone"}</span>{" "}
            {row.notification.type}d your zost.
          </div>
        ))
      ) : (
        <div className="p-8 text-sm text-zinc-500">Nothing here yet.</div>
      )}
    </AppShell>
  );
}
