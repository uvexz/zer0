import { desc } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button, Input } from "@/components/kumo";
import { db } from "@/db";
import { domainBlocks } from "@/db/schema";
import { blockDomainAction, unblockDomainAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const { profile } = await requireAdmin();
  const rows = await db.select().from(domainBlocks).orderBy(desc(domainBlocks.createdAt));
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Blocks</h1>
      </header>
      <AdminNav current="/admin/blocks" />
      <form action={blockDomainAction} className="grid gap-3 border-b border-zinc-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Input name="domain" aria-label="Domain" placeholder="example.social" required size="sm" />
        <Input name="reason" aria-label="Reason" placeholder="Reason" size="sm" />
        <Button type="submit" variant="primary" size="sm">Block</Button>
      </form>
      {rows.map((block) => (
        <div key={block.id} className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4 text-sm">
          <div className="min-w-0">
            <div className="font-medium">{block.domain}</div>
            <div className="text-zinc-500">{block.reason || "No reason recorded"}</div>
          </div>
          <form action={unblockDomainAction}>
            <input type="hidden" name="domain" value={block.domain} />
            <Button type="submit" variant="secondary" size="sm">Unblock</Button>
          </form>
        </div>
      ))}
    </AppShell>
  );
}
