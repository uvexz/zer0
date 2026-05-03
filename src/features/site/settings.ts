import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { cacheTags } from "@/lib/cache-tags";
import { cachedRead } from "@/lib/cached-read";

export const SITE_SETTINGS_ID = "site";
export const SITE_SETTINGS_CACHE_TAG = cacheTags.siteSettings;

export const defaultSiteSettings = {
  id: SITE_SETTINGS_ID,
  siteName: "Zer0",
  siteDescription: "A quiet federated microblog for zosts.",
  showLocalZosts: true,
};

async function readSiteSettings() {
  try {
    const [settings] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, SITE_SETTINGS_ID))
      .limit(1);

    return settings ?? defaultSiteSettings;
  } catch {
    return defaultSiteSettings;
  }
}

export async function getSiteSettings() {
  return cachedRead({
    key: SITE_SETTINGS_CACHE_TAG,
    tags: [SITE_SETTINGS_CACHE_TAG],
    load: readSiteSettings,
  });
}
