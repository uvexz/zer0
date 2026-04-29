import { federationFetch } from "@/features/federation/fedify";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return federationFetch(request);
}
