import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ZostCard } from "@/components/zost-card";
import { getSession } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { getProfileByUsername } from "@/features/accounts/queries";
import { getProfilePosts } from "@/features/posts/queries";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = rawUsername.replace(/^@/, "");
  const session = await getSession();
  const profileRow = await getProfileByUsername(username);
  if (!profileRow) notFound();

  const posts = await getProfilePosts(username, session?.user.id);

  if (!session) {
    return (
      <main className="mx-auto max-w-2xl bg-white">
        <ProfileHeader profile={profileRow.profile} />
        {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
      </main>
    );
  }

  const viewer = await requireUser();
  return (
    <AppShell profile={viewer.profile}>
      <ProfileHeader profile={profileRow.profile} />
      {posts.map((item) => <ZostCard key={item.post.id} item={item} />)}
    </AppShell>
  );
}

function ProfileHeader({ profile }: { profile: Awaited<ReturnType<typeof getProfileByUsername>>["profile"] }) {
  return (
    <header className="border-b border-zinc-200 p-4">
      <div className="h-28 rounded-md bg-zinc-100" />
      <div className="mt-4">
        <h1 className="text-xl font-semibold">{profile.displayName}</h1>
        <p className="text-sm text-zinc-500">@{profile.username}</p>
        {profile.bio ? <p className="mt-3 whitespace-pre-wrap text-sm">{profile.bio}</p> : null}
      </div>
    </header>
  );
}
