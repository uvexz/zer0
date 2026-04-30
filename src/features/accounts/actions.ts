"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actors, profiles } from "@/db/schema";
import { requireUser } from "@/features/auth/guards";
import { savePublicProfileMedia } from "@/features/media/service";
import { isZostVisibility } from "@/features/posts/types";

export async function updateProfileAction(formData: FormData) {
  const { session, profile } = await requireUser();
  const displayName = String(formData.get("displayName") ?? profile.displayName).trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatarFile = uploadedFile(formData.get("avatar"));
  const headerFile = uploadedFile(formData.get("header"));
  const avatar = avatarFile
    ? await savePublicProfileMedia({
        ownerUserId: session.user.id,
        file: avatarFile,
        kind: "avatar",
      })
    : null;
  const header = headerFile
    ? await savePublicProfileMedia({
        ownerUserId: session.user.id,
        file: headerFile,
        kind: "header",
      })
    : null;

  await db
    .update(profiles)
    .set({
      displayName: displayName || profile.username,
      bio,
      avatarUrl: avatar?.url ?? profile.avatarUrl,
      headerUrl: header?.url ?? profile.headerUrl,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, session.user.id));

  await db
    .update(actors)
    .set({
      name: displayName || profile.username,
      summary: bio,
      avatarUrl: avatar?.url ?? profile.avatarUrl,
      headerUrl: header?.url ?? profile.headerUrl,
      updatedAt: new Date(),
    })
    .where(eq(actors.userId, session.user.id));

  revalidatePath(`/@${profile.username}`);
  revalidatePath("/settings/profile");
}

export async function updateFederationSettingsAction(formData: FormData) {
  const { session, profile } = await requireUser();
  const visibilityValue = formData.get("defaultZostVisibility");
  const defaultZostVisibility = isZostVisibility(visibilityValue) ? visibilityValue : "public";

  await db
    .update(profiles)
    .set({
      defaultZostVisibility,
      isDiscoverable: formData.get("isDiscoverable") === "on",
      manuallyApprovesFollowers: formData.get("manuallyApprovesFollowers") === "on",
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, session.user.id));

  revalidatePath("/settings/federation");
  revalidatePath("/");
  revalidatePath(`/@${profile.username}`);
}

function uploadedFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}
