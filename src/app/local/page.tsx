import { AppShell } from "@/components/app-shell";
import { ZostCard } from "@/components/zost-card";
import { requireUser } from "@/features/auth/guards";
import { getLocalTimeline } from "@/features/posts/queries";

export const dynamic = "force-dynamic";

export default async function LocalPage() {
  const { session, profile } = await requireUser();
  const timeline = await getLocalTimeline(session.user.id);

  return (
    <AppShell profile={profile}>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Local</h1>
      </header>
      {timeline.length ? (
        timeline.map((item) => <ZostCard key={item.post.id} item={item} />)
      ) : (
        <div className="p-8 text-sm text-zinc-500">No public local zosts yet.</div>
      )}
    </AppShell>
  );
}
