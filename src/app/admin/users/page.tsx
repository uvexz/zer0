import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Badge, Button } from "@/components/kumo";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { disableUserAction, restoreUserAction } from "@/features/admin/actions";
import { canToggleUserDisabled } from "@/features/admin/policy";
import { requireAdmin } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { session, profile } = await requireAdmin();
  const rows = await db
    .select({ profile: profiles, account: user })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .orderBy(desc(profiles.createdAt))
    .limit(100);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Users</h1>
      </header>
      <div className="divide-y divide-zinc-200">
        {rows.map((row) => {
          const canToggle = canToggleUserDisabled({
            currentUserId: session.user.id,
            targetUserId: row.profile.userId,
            targetIsAdmin: row.profile.isAdmin,
          });

          return (
            <div key={row.profile.userId} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.profile.displayName}</span>
                  <span className="text-zinc-500">@{row.profile.username}</span>
                  {row.profile.isAdmin ? <Badge variant="secondary">admin</Badge> : null}
                  {row.profile.disabledAt ? <Badge variant="secondary">disabled</Badge> : null}
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500">
                  {row.account.email} · joined {row.profile.createdAt.toISOString()}
                </div>
              </div>
              {canToggle ? (
                <form action={row.profile.disabledAt ? restoreUserAction : disableUserAction}>
                  <input type="hidden" name="userId" value={row.profile.userId} />
                  <Button
                    type="submit"
                    variant={row.profile.disabledAt ? "secondary" : "secondary-destructive"}
                    size="sm"
                  >
                    {row.profile.disabledAt ? "Restore" : "Disable"}
                  </Button>
                </form>
              ) : (
                <span className="self-center text-xs text-zinc-400">Protected</span>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
