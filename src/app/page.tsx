import Link from "next/link";
import { AppShell, PublicAppShell } from "@/components/app-shell";
import { ComposeBox } from "@/components/compose-box";
import { ZostCard } from "@/components/zost-card";
import { getSession } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { getHomeTimeline, getLocalTimeline, type ZostListItem } from "@/features/posts/queries";
import { getSiteSettings } from "@/features/site/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentSession = await getSession();
  if (!currentSession) return <LandingPage />;

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

async function LandingPage() {
  const settings = await getSiteSettings();
  const localTimeline = settings.showLocalZosts ? await getLocalTimeline(undefined, 5) : [];

  return (
    <PublicAppShell siteName={settings.siteName}>
      <div className="px-4 py-8 sm:px-8">
        <section className="mx-auto max-w-3xl border-b border-zinc-200 pb-8">
          <div className="mb-6 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/zer0.png" alt="" className="size-12 rounded-md border border-zinc-200" />
            <div>
              <p className="text-xs font-medium uppercase text-zinc-500">Fediverse instance</p>
              <h1 className="text-3xl font-semibold text-zinc-950">{settings.siteName}</h1>
            </div>
          </div>
          <p className="max-w-2xl text-base leading-7 text-zinc-600">
            {settings.siteDescription}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/login"
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Register
            </Link>
          </div>
        </section>

        {settings.showLocalZosts ? (
          <section className="mx-auto max-w-3xl py-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Local zosts</h2>
              <Link href="/login" className="text-sm font-medium text-zinc-700 hover:text-zinc-950">
                Join the conversation
              </Link>
            </div>
            <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {localTimeline.length ? (
                localTimeline.map((item) => <PublicZostPreview key={item.post.id} item={item} />)
              ) : (
                <p className="p-4 text-sm text-zinc-500">No public local zosts yet.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </PublicAppShell>
  );
}

function PublicZostPreview({ item }: { item: ZostListItem }) {
  return (
    <article className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link href={item.author.href} className="font-medium text-zinc-900">
          {item.author.displayName}
        </Link>
        <span className="text-zinc-500">{item.author.handle}</span>
        <time className="text-xs text-zinc-400" dateTime={item.post.publishedAt.toISOString()}>
          {item.post.publishedAt.toLocaleDateString("en", { month: "short", day: "numeric" })}
        </time>
      </div>
      <div
        className="prose prose-zinc max-w-none text-sm leading-6"
        dangerouslySetInnerHTML={{ __html: item.post.contentHtml }}
      />
    </article>
  );
}
