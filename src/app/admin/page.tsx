import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import { requireAdmin } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { profile } = await requireAdmin();
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Admin</h1>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {[
          ["/admin/invites", "Invites"],
          ["/admin/blocks", "Domain blocks"],
          ["/admin/federation", "Federation logs"],
        ].map(([href, label]) => (
          <Link key={href} href={href}>
            <LayerCard className="p-4 text-sm font-medium hover:bg-zinc-50">{label}</LayerCard>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
