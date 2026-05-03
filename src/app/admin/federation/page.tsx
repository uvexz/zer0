import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/kumo";
import { db } from "@/db";
import { deliveryJobs, inboxEvents } from "@/db/schema";
import { retryDeliveryAction } from "@/features/admin/actions";
import {
  deliveryStatusFilters,
  isDeliveryRetryableStatus,
  parseDeliveryStatusFilter,
} from "@/features/admin/policy";
import { requireAdmin } from "@/features/auth/guards";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";

export default async function FederationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile } = await requireAdmin();
  const { status } = await searchParams;
  const statusFilter = parseDeliveryStatusFilter(status);
  const deliveries = statusFilter
    ? await db
        .select()
        .from(deliveryJobs)
        .where(eq(deliveryJobs.status, statusFilter))
        .orderBy(desc(deliveryJobs.createdAt))
        .limit(30)
    : await db
        .select()
        .from(deliveryJobs)
        .orderBy(desc(deliveryJobs.createdAt))
        .limit(30);
  const inbox = await db.select().from(inboxEvents).orderBy(desc(inboxEvents.createdAt)).limit(30);

  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Federation</h1>
      </header>
      <AdminNav current="/admin/federation" />
      <section className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Delivery jobs</h2>
          <div className="flex gap-2 text-xs">
            <Link
              href="/admin/federation"
              className={`rounded border px-2 py-1 ${statusFilter === null ? "border-zinc-900 text-zinc-900" : "border-zinc-200 text-zinc-500"}`}
            >
              all
            </Link>
            {deliveryStatusFilters.map((item) => (
              <Link
                key={item}
                href={`/admin/federation?status=${item}`}
                className={`rounded border px-2 py-1 ${statusFilter === item ? "border-zinc-900 text-zinc-900" : "border-zinc-200 text-zinc-500"}`}
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
        <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {deliveries.length ? (
            deliveries.map((job) => (
              <div key={job.id} className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{job.targetInboxUrl}</div>
                  <div className="text-zinc-500">
                    {job.activityType} · {job.status} · attempts {job.attemptCount}
                  </div>
                  <div className="truncate text-xs text-zinc-500">{job.activityUri}</div>
                  <div className="text-xs text-zinc-500">
                    {job.responseStatus ? `HTTP ${job.responseStatus}` : "No HTTP response recorded"}
                    {job.nextRetryAt ? ` · next retry ${job.nextRetryAt.toISOString()}` : ""}
                    {` · updated ${job.updatedAt.toISOString()}`}
                  </div>
                  {job.responseExcerpt ? (
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                      {job.responseExcerpt}
                    </pre>
                  ) : null}
                  {job.finalFailureReason ? (
                    <div className="mt-1 text-xs text-red-700">{job.finalFailureReason}</div>
                  ) : null}
                </div>
                <form action={retryDeliveryAction}>
                  <input type="hidden" name="id" value={job.id} />
                  <Button type="submit" size="sm" disabled={!isDeliveryRetryableStatus(job.status)}>
                    Retry
                  </Button>
                </form>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-zinc-500">
              No delivery jobs{statusFilter ? ` with ${statusFilter} status` : ""}.
            </div>
          )}
        </div>
      </section>
      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Inbox events</h2>
        <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {inbox.length ? (
            inbox.map((event) => (
              <div key={event.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.activityType}</span>
                  <span className="text-zinc-500">{event.status}</span>
                  <span className="text-xs text-zinc-400">{event.createdAt.toISOString()}</span>
                </div>
                {event.actorUri ? <div className="mt-1 truncate text-xs text-zinc-500">Actor: {event.actorUri}</div> : null}
                {event.activityUri ? <div className="truncate text-xs text-zinc-500">Activity: {event.activityUri}</div> : null}
                {event.error ? <div className="mt-1 text-xs text-red-700">{event.error}</div> : null}
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-zinc-500">No inbox events recorded.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
