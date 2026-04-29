import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, profiles } from "@/db/schema";

export async function validateInvite(code: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.code, code.trim()),
        isNull(invites.disabledAt),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
        sql`${invites.usedCount} < ${invites.maxUses}`,
      ),
    )
    .limit(1);

  return invite ?? null;
}

export async function consumeInvite(inviteId: string) {
  await db
    .update(invites)
    .set({ usedCount: sql`${invites.usedCount} + 1` })
    .where(eq(invites.id, inviteId));
}

export async function isFirstLocalUser() {
  const existing = await db.select({ userId: profiles.userId }).from(profiles).limit(1);
  return existing.length === 0;
}
