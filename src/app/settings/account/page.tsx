import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import { auth } from "@/features/auth/auth";
import { requireUser } from "@/features/auth/guards";
import { SettingsNav } from "../settings-nav";
import { PasskeySettings } from "./passkey-settings";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const { session, profile } = await requireUser();
  const passkeys = await auth.api.listPasskeys({
    headers: await headers(),
  });

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Account</h1>
      </header>
      <SettingsNav current="/settings/account" />
      <div className="p-4">
        <LayerCard className="max-w-xl p-4">
          <div className="text-sm text-zinc-500">Signed in as</div>
          <div className="mt-1 font-medium">{session.user.email}</div>
        </LayerCard>
        <div className="mt-4">
          <PasskeySettings
            initialPasskeys={passkeys.map((passkey) => ({
              id: passkey.id,
              name: passkey.name ?? null,
              deviceType: passkey.deviceType,
              backedUp: passkey.backedUp,
              createdAt: passkey.createdAt.toISOString(),
            }))}
            defaultName={`${profile.username}'s passkey`}
          />
        </div>
      </div>
    </AppShell>
  );
}
