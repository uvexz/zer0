import { federationFetch } from "@/features/federation/fedify";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  if (wantsHtml(request)) {
    const { username } = await context.params;
    return Response.redirect(new URL(`/@${encodeURIComponent(username)}`, request.url), 302);
  }

  return federationFetch(request);
}

function wantsHtml(request: Request) {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return accept.includes("text/html");
}
