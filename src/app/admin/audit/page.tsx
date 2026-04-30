import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import { db } from "@/db";
import { auditLogs, profiles, user } from "@/db/schema";
import { formatAuditMetadataPreview } from "@/features/admin/policy";
import { requireAdmin } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { profile } = await requireAdmin();
  const rows = await db
    .select({ audit: auditLogs, profile: profiles, account: user })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.userId, auditLogs.actorUserId))
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Audit logs</h1>
      </header>
      <section className="p-4">
        <LayerCard className="overflow-hidden">
          {rows.length ? (
            <div className="divide-y divide-zinc-200">
              {rows.map(({ audit, profile: actorProfile, account }) => {
                const metadata = formatAuditMetadataPreview(audit.metadata);
                return (
                  <div key={audit.id} className="grid gap-2 p-3 text-sm md:grid-cols-[160px_minmax(0,1fr)]">
                    <time className="text-xs text-zinc-500" dateTime={audit.createdAt.toISOString()}>
                      {audit.createdAt.toISOString()}
                    </time>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-900">{audit.action}</span>
                        <span className="text-xs text-zinc-500">by {actorLabel(actorProfile, account, audit.actorUserId)}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-zinc-600">{audit.target}</div>
                      {metadata ? (
                        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                          {metadata}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-sm text-zinc-500">No audit logs recorded.</div>
          )}
        </LayerCard>
      </section>
    </AppShell>
  );
}

function actorLabel(
  profile: typeof profiles.$inferSelect | null,
  account: typeof user.$inferSelect | null,
  actorUserId: string | null,
) {
  if (profile) return `@${profile.username}`;
  if (account) return account.email;
  return actorUserId ?? "system";
}

