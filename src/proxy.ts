import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!wantsActivityJson(request)) return NextResponse.next();

  const match = /^\/@([^/]+)(?:\/([^/]+))?$/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();

  const [, username, postId] = match;
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
