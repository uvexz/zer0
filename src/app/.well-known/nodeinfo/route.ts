import { env } from "@/lib/env";

export function GET() {
  return Response.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href: `${env.APP_ORIGIN}/nodeinfo/2.1`,
      },
    ],
  });
}
