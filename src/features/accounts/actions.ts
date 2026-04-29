"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actors, profiles } from "@/db/schema";
import { requireUser } from "@/features/auth/guards";

export async function updateProfileAction(formData: FormData) {
  const { session, profile } = await requireUser();
  const displayName = String(formData.get("displayName") ?? profile.displayName).trim();
  const bio = String(formData.get("bio") ?? "").trim();

  await db
    .update(profiles)
    .set({
      displayName: displayName || profile.username,
      bio,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, session.user.id));

  await db
    .update(actors)
    .set({
      name: displayName || profile.username,
      summary: bio,
      updatedAt: new Date(),
    })
    .where(eq(actors.userId, session.user.id));

  revalidatePath(`/@${profile.username}`);
  revalidatePath("/settings/profile");
}
