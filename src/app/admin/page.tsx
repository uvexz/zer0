import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Input, LayerCard, Textarea } from "@/components/kumo";
import { updateSiteSettingsAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";
import { getSiteSettings } from "@/features/site/settings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { profile } = await requireAdmin();
  const siteSettings = await getSiteSettings();

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Admin</h1>
      </header>
      <div className="space-y-4 p-4">
        <form action={updateSiteSettingsAction} className="max-w-xl space-y-4 rounded-md border border-zinc-200 p-4">
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
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="showLocalZosts"
              defaultChecked={siteSettings.showLocalZosts}
              className="size-4 rounded border-zinc-300"
            />
            Show local zosts on the landing page
          </label>
          <Button type="submit" variant="primary">Save site information</Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["/admin/users", "Users"],
            ["/admin/moderation", "Moderation"],
            ["/admin/invites", "Invites"],
            ["/admin/blocks", "Blocks"],
            ["/admin/federation", "Federation logs"],
            ["/admin/audit", "Audit logs"],
          ].map(([href, label]) => (
            <Link key={href} href={href}>
              <LayerCard className="p-4 text-sm font-medium hover:bg-zinc-50">{label}</LayerCard>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
