import { AppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import { requireUser } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const { session, profile } = await requireUser();
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Account</h1>
      </header>
      <div className="p-4">
        <LayerCard className="max-w-xl p-4">
          <div className="text-sm text-zinc-500">Signed in as</div>
          <div className="mt-1 font-medium">{session.user.email}</div>
        </LayerCard>
      </div>
    </AppShell>
  );
}
