import { desc } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button, Input } from "@/components/kumo";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { createInviteAction, disableInviteAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const { profile } = await requireAdmin();
  const rows = await db.select().from(invites).orderBy(desc(invites.createdAt));
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Invites</h1>
      </header>
      <AdminNav current="/admin/invites" />
      <form action={createInviteAction} className="grid gap-3 border-b border-zinc-200 p-4 sm:grid-cols-[1fr_120px_auto]">
        <Input name="code" aria-label="Invite code" placeholder="Invite code or leave blank" size="sm" />
        <Input name="maxUses" aria-label="Max uses" type="number" defaultValue={1} min={1} size="sm" />
        <Button type="submit" variant="primary" size="sm">Create</Button>
      </form>
      {rows.map((invite) => (
        <div key={invite.id} className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4 text-sm">
          <div>
            <div className="font-medium">{invite.code}</div>
            <div className="text-zinc-500">{invite.usedCount}/{invite.maxUses} used</div>
          </div>
          {invite.disabledAt ? (
            <span className="text-zinc-400">Disabled</span>
          ) : (
            <form action={disableInviteAction}>
              <input type="hidden" name="id" value={invite.id} />
              <Button type="submit" variant="secondary-destructive" size="sm">Disable</Button>
            </form>
          )}
        </div>
      ))}
    </AppShell>
  );
}
