import { desc } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button, Input } from "@/components/kumo";
import { db } from "@/db";
import { domainBlocks } from "@/db/schema";
import { blockDomainAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const { profile } = await requireAdmin();
  const rows = await db.select().from(domainBlocks).orderBy(desc(domainBlocks.createdAt));
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Blocks</h1>
      </header>
      <form action={blockDomainAction} className="grid gap-3 border-b border-zinc-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Input name="domain" aria-label="Domain" placeholder="example.social" required size="sm" />
        <Input name="reason" aria-label="Reason" placeholder="Reason" size="sm" />
        <Button type="submit" variant="primary" size="sm">Block</Button>
      </form>
      {rows.map((block) => (
        <div key={block.id} className="border-b border-zinc-200 p-4 text-sm">
          <div className="font-medium">{block.domain}</div>
          <div className="text-zinc-500">{block.reason || "No reason recorded"}</div>
        </div>
      ))}
    </AppShell>
  );
}
