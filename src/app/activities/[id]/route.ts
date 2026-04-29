import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { buildActivity } from "@/features/federation/vocab";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<unknown> }) {
  const { id } = (await context.params) as { id: string };
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, id))
    .limit(1);

  const object = activity ? await buildActivity(activity) : null;
  if (!object) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(await object.toJsonLd({ format: "compact" }), {
    headers: { "content-type": "application/activity+json; charset=utf-8" },
  });
}
