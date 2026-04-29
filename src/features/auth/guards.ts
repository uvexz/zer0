import { redirect } from "next/navigation";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "./auth";

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (!profile) redirect("/register/profile");
  if (profile.disabledAt) redirect("/login");

  return { session, profile };
}

export async function requireAdmin() {
  const context = await requireUser();
  if (!context.profile.isAdmin) redirect("/");
  return context;
}
