import { unstable_cache } from "next/cache";
import { cacheVersionSignature } from "./cache-version";

export async function cachedRead<T>({
  key,
  tags,
  load,
}: {
  key: string;
  tags: string[];
  load: () => Promise<T>;
}) {
  const version = await cacheVersionSignature(tags);
  if (!version.ok) return load();

  return unstable_cache(load, [key, version.value], {
    tags,
    revalidate: false,
  })();
}
