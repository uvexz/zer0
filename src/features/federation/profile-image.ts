import { Image } from "@fedify/fedify/vocab";
import { env } from "@/lib/env";

export function profileImage(url: string | null) {
  if (!url) return null;

  return new Image({
    mediaType: "image/*",
    url: new URL(url, env.APP_ORIGIN),
  });
}
