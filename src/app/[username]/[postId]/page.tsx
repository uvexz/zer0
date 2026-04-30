import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ComposeBox } from "@/components/compose-box";
import { ZostCard } from "@/components/zost-card";
import { getSession } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { canViewPost } from "@/features/posts/visibility";
import { getZostThread } from "@/features/posts/queries";

export const dynamic = "force-dynamic";

export default async function ZostPage({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}) {
  const { postId } = await params;
  const session = await getSession();
  const canView = await canViewPost(postId, session?.user.id);
  if (!canView) notFound();

  const thread = await getZostThread(postId, session?.user.id);

  if (!session) {
    return (
      <main className="mx-auto max-w-2xl bg-white">
        {thread.map((item) => <ZostCard key={item.post.id} item={item} showThreadLink={false} />)}
      </main>
    );
  }

  const viewer = await requireUser();
  return (
    <AppShell profile={viewer.profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Thread</h1>
      </header>
      {thread.map((item) => <ZostCard key={item.post.id} item={item} showThreadLink={false} />)}
      <ComposeBox replyToPostId={postId} defaultVisibility={viewer.profile.defaultZostVisibility} />
    </AppShell>
  );
}
