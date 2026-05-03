import { updateTag } from "next/cache";
import { uniqueCacheTags } from "./cache-tags";
import { bumpCacheTags } from "./cache-version";

export async function invalidateCacheTagsFromAction(tags: Array<string | null | undefined>) {
  const normalizedTags = uniqueCacheTags(tags);
  for (const tag of normalizedTags) {
    updateTag(tag);
  }
  await bumpCacheTags(normalizedTags);
}
