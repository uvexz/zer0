import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const match = /^\/@([^/]+)(?:\/([^/]+))?$/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();

  const [, username, postId] = match;
  if (!wantsActivityJson(request)) return nextWithActivityJsonLink(request, username, postId);

  const url = request.nextUrl.clone();
  url.pathname = postId ? `/objects/${postId}` : `/users/${decodeURIComponent(username)}`;

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/@:path*",
};

function wantsActivityJson(request: NextRequest) {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return (
    accept.includes("application/activity+json") ||
    accept.includes("application/ld+json") ||
    accept.includes("application/activitystreams+json")
  );
}

function nextWithActivityJsonLink(request: NextRequest, username: string, postId?: string) {
  const response = NextResponse.next();
  const href = postId
    ? `/objects/${postId}`
    : `/users/${decodeURIComponent(username)}`;
  const activityUrl = new URL(href, request.url);
  response.headers.set(
    "link",
    `<${activityUrl.href}>; rel="alternate"; type="application/activity+json"`,
  );
  return response;
}
