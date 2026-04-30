import { AppShell } from "@/components/app-shell";
import { ComposeBox } from "@/components/compose-box";
import { ZostCard } from "@/components/zost-card";
import { requireUser } from "@/features/auth/guards";
import { getHomeTimeline } from "@/features/posts/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { session, profile } = await requireUser();
  const timeline = await getHomeTimeline(session.user.id);

  return (
    <AppShell profile={profile}>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Home</h1>
      </header>
      <ComposeBox defaultVisibility={profile.defaultZostVisibility} />
      {timeline.length ? (
        timeline.map((item) => <ZostCard key={item.post.id} item={item} />)
      ) : (
        <div className="p-8 text-sm text-zinc-500">No zosts yet.</div>
      )}
    </AppShell>
  );
}
