import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const SITE_SETTINGS_ID = "site";

export const defaultSiteSettings = {
  id: SITE_SETTINGS_ID,
  siteName: "Zer0",
  siteDescription: "A quiet federated microblog for zosts.",
  showLocalZosts: true,
};

export async function getSiteSettings() {
  const [settings] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1);

  return settings ?? defaultSiteSettings;
}
