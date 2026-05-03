import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell, PublicAppShell } from "@/components/app-shell";
import { ComposeBox } from "@/components/compose-box";
import { ZostCard } from "@/components/zost-card";
import { getSession } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { canViewPost } from "@/features/posts/visibility";
import { getPostByIdForViewer, getZostThread } from "@/features/posts/queries";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  const item = await getPostByIdForViewer(postId);
  if (!item) return {};

  return {
    alternates: {
      canonical: item.post.url,
      types: {
        "application/activity+json": `${env.APP_ORIGIN}/objects/${postId}`,
      },
    },
  };
}

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
      <PublicAppShell>
        <header className="border-b border-zinc-200 px-4 py-3">
          <h1 className="text-lg font-semibold">Thread</h1>
        </header>
        {thread.map((item) => <ZostCard key={item.post.id} item={item} showThreadLink={false} />)}
      </PublicAppShell>
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
