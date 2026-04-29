import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { actors, notifications, posts } from "@/db/schema";
import { requireUser } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { session, profile } = await requireUser();
  const { tab = "all" } = await searchParams;
  const typeFilter = tab === "mentions" ? "mention" : tab === "follows" ? "follow" : null;
  const rows = await db
    .select({ notification: notifications, actor: actors, post: posts })
    .from(notifications)
    .leftJoin(actors, eq(actors.id, notifications.actorId))
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .where(
      typeFilter
        ? and(eq(notifications.userId, session.user.id), eq(notifications.type, typeFilter))
        : eq(notifications.userId, session.user.id),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Notifications</h1>
        <nav className="mt-3 flex gap-2 text-sm">
          <TabLink href="/notifications" active={tab === "all"}>All</TabLink>
          <TabLink href="/notifications?tab=mentions" active={tab === "mentions"}>Mentions</TabLink>
          <TabLink href="/notifications?tab=follows" active={tab === "follows"}>Follows</TabLink>
        </nav>
      </header>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.notification.id} className="border-b border-zinc-200 px-4 py-3 text-sm">
            <span className="font-medium">{row.actor?.name ?? row.actor?.handle ?? "Someone"}</span>{" "}
            {notificationText(row.notification.type)}
          </div>
        ))
      ) : (
        <div className="p-8 text-sm text-zinc-500">Nothing here yet.</div>
      )}
    </AppShell>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2 py-1 ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
    >
      {children}
    </Link>
  );
}

function notificationText(type: string) {
  switch (type) {
    case "follow":
      return "followed you.";
    case "reply":
      return "replied to your zost.";
    case "mention":
      return "mentioned you.";
    case "announce":
      return "announced your zost.";
    case "like":
      return "liked your zost.";
    default:
      return "interacted with your zost.";
  }
}
