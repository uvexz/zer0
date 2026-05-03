import { cacheRedis } from "@/lib/redis-cache-client";
import { uniqueCacheTags } from "./cache-tags";

export type CacheVersionStore = {
  mget(...keys: string[]): Promise<Array<string | null>>;
  incr(key: string): Promise<number>;
};

const cacheVersionNamespace = "zer0:cache-version:v1";
const cacheOperationTimeoutMs = 75;

export type CacheVersionSignature =
  | { ok: true; value: string }
  | { ok: false };

export async function cacheVersionSignature(
  tags: string[],
  store: CacheVersionStore = cacheRedis,
): Promise<CacheVersionSignature> {
  const normalizedTags = uniqueCacheTags(tags).sort();
  if (!normalizedTags.length) return { ok: true, value: "no-tags" };

  const keys = normalizedTags.map(cacheVersionKey);
  const versions = await cacheOperation(() => store.mget(...keys));
  if (!versions) return { ok: false };

  return {
    ok: true,
    value: normalizedTags
      .map((tag, index) => `${tag}=${versions[index] ?? "0"}`)
      .join("|"),
  };
}

export async function bumpCacheTags(
  tags: Array<string | null | undefined>,
  store: CacheVersionStore = cacheRedis,
) {
  const normalizedTags = uniqueCacheTags(tags);
  if (!normalizedTags.length) return false;

  const result = await cacheOperation(async () => {
    await Promise.all(normalizedTags.map((tag) => store.incr(cacheVersionKey(tag))));
    return true;
  });

  return Boolean(result);
}

export function cacheVersionKey(tag: string) {
  return `${cacheVersionNamespace}:${tag}`;
}

async function cacheOperation<T>(operation: () => Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), cacheOperationTimeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
