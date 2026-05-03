import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { cacheTags } from "@/lib/cache-tags";
import { cacheVersionSignature, type CacheVersionStore } from "@/lib/cache-version";
import { cacheRedis } from "@/lib/redis-cache-client";

type CachedResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
};

export type FederationResponseCacheStore = CacheVersionStore & {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
};

const cacheNamespace = "zer0:federation-response:v1";
const defaultTtlSeconds = 3600;
const maxCachedBodyBytes = 512 * 1024;
const cacheOperationTimeoutMs = 75;

export async function cachedFederationGet(
  request: Request,
  fetchResponse: () => Promise<Response>,
  store: FederationResponseCacheStore = cacheRedis,
) {
  if (!shouldCacheFederationRequest(request)) {
    return fetchResponse();
  }

  const tags = federationResponseCacheTags(request);
  const version = await cacheVersionSignature(tags, store);
  if (!version.ok) {
    return fetchResponse();
  }

  const key = federationResponseCacheKey(request, version.value);
  const cached = await cacheOperation(() => store.get(key));
  if (cached) {
    const parsed = cachedResponseFromJson(cached);
    if (parsed) return responseFromCachedResponse(parsed, "HIT");
  }

  const response = await fetchResponse();
  if (!shouldStoreFederationResponse(response)) return response;

  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxCachedBodyBytes) {
    return responseFromBody(response, body, "BYPASS");
  }

  const entry: CachedResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: serializableHeaders(response.headers),
    body,
  };
  const ttlSeconds = env.FEDERATION_CACHE_TTL_SECONDS ?? defaultTtlSeconds;
  await cacheOperation(() =>
    store.setex(key, ttlSeconds, JSON.stringify(entry)),
  );

  return responseFromCachedResponse(entry, "MISS");
}

export function shouldCacheFederationRequest(request: Request) {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  if (request.headers.has("signature")) return false;
  if (request.headers.has("signature-input")) return false;

  const path = new URL(request.url).pathname;
  return (
    path === "/.well-known/webfinger" ||
    path === "/nodeinfo/2.1" ||
    /^\/activities\/[^/]+$/.test(path) ||
    /^\/objects\/[^/]+$/.test(path) ||
    /^\/users\/[^/]+(?:\/(?:followers|following|liked|outbox))?$/.test(path)
  );
}

export function federationResponseCacheTags(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const usersMatch = path.match(/^\/users\/([^/]+)(?:\/([^/]+))?$/);

  if (path === "/nodeinfo/2.1") return [cacheTags.nodeInfo];
  if (path === "/.well-known/webfinger") {
    const username = webfingerUsername(url);
    return username ? [cacheTags.webfinger(username), cacheTags.profile(username)] : [];
  }
  if (/^\/objects\/[^/]+$/.test(path)) {
    return [cacheTags.post(path.split("/")[2])];
  }
  if (/^\/activities\/[^/]+$/.test(path)) {
    return [cacheTags.activity(path.split("/")[2])];
  }
  if (usersMatch) {
    const username = decodeURIComponent(usersMatch[1]);
    switch (usersMatch[2]) {
      case "followers":
        return [cacheTags.profile(username), cacheTags.followersCollection(username)];
      case "following":
        return [cacheTags.profile(username), cacheTags.followingCollection(username)];
      case "liked":
        return [cacheTags.profile(username), cacheTags.likedCollection(username)];
      case "outbox":
        return [cacheTags.profile(username), cacheTags.localTimeline];
      case undefined:
        return [cacheTags.profile(username)];
      default:
        return [];
    }
  }

  return [];
}

function federationResponseCacheKey(request: Request, version: string) {
  const url = new URL(request.url);
  const accept = request.headers.get("accept") ?? "";
  const hash = createHash("sha256")
    .update(`${url.pathname}${url.search}\n${accept}\n${version}`)
    .digest("base64url");
  return `${cacheNamespace}:${hash}`;
}

function webfingerUsername(url: URL) {
  const resource = url.searchParams.get("resource") ?? "";
  const host = new URL(env.APP_ORIGIN).host;
  const match = resource.match(/^acct:([^@]+)@(.+)$/);
  if (!match || match[2] !== host) return null;
  return match[1];
}

function shouldStoreFederationResponse(response: Response) {
  if (response.status !== 200) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.includes("application/activity+json") ||
    contentType.includes("application/ld+json") ||
    contentType.includes("application/jrd+json") ||
    contentType.includes("application/json")
  );
}

function serializableHeaders(headers: Headers) {
  const pairs: Array<[string, string]> = [];
  headers.forEach((value, key) => {
    if (
      key === "set-cookie" ||
      key === "content-length" ||
      key === "x-zer0-cache"
    )
      return;
    pairs.push([key, value]);
  });
  return pairs;
}

function cachedResponseFromJson(value: string) {
  try {
    const parsed = JSON.parse(value) as CachedResponse;
    if (
      typeof parsed.status !== "number" ||
      typeof parsed.statusText !== "string" ||
      !Array.isArray(parsed.headers) ||
      typeof parsed.body !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function responseFromCachedResponse(
  entry: CachedResponse,
  cacheStatus: "HIT" | "MISS",
) {
  const headers = new Headers(entry.headers);
  headers.set("x-zer0-cache", cacheStatus);
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers,
  });
}

function responseFromBody(
  response: Response,
  body: string,
  cacheStatus: "BYPASS",
) {
  const headers = new Headers(response.headers);
  headers.set("x-zer0-cache", cacheStatus);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
