import { AppShell } from "@/components/app-shell";
import { Button, Input, LayerCard, Textarea } from "@/components/kumo";
import { updateSiteSettingsAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";
import { getSiteSettings } from "@/features/site/settings";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { profile } = await requireAdmin();
  const siteSettings = await getSiteSettings();

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Admin</h1>
      </header>
      <AdminNav current="/admin" />
      <div className="max-w-2xl space-y-4 p-4">
        <LayerCard className="p-4">
          <form action={updateSiteSettingsAction} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Site information</h2>
              <p className="mt-1 text-sm text-zinc-500">Shown on the public landing page.</p>
            </div>
            <Input name="siteName" label="Site name" defaultValue={siteSettings.siteName} required />
            <Textarea
              name="siteDescription"
              label="Site description"
              defaultValue={siteSettings.siteDescription}
              className="min-h-28"
            />
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="showLocalZosts"
                defaultChecked={siteSettings.showLocalZosts}
                className="mt-1 size-4 rounded border-zinc-300"
              />
              <span>
                <span className="block font-medium text-zinc-900">Show local zosts</span>
                <span className="text-zinc-500">Include recent public local posts on the landing page.</span>
              </span>
            </label>
            <Button type="submit" variant="primary">Save site information</Button>
          </form>
        </LayerCard>
      </div>
    </AppShell>
  );
}
