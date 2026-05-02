import { Person } from "@fedify/fedify/vocab";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { profileImage } from "./profile-image";

describe("profile ActivityPub images", () => {
  it("embeds profile media as Image objects instead of dereferenceable ids", async () => {
    const person = new Person({
      id: new URL(`${env.APP_ORIGIN}/users/jake`),
      icon: profileImage("/api/profile-media/avatar"),
    });

    const icons = [];
    for await (const icon of person.getIcons({
      documentLoader: async () => {
        throw new Error("profile images should not be fetched as JSON-LD");
      },
    })) {
      icons.push(icon);
    }

    expect(icons).toHaveLength(1);
    expect(icons[0]?.url?.href).toBe(`${env.APP_ORIGIN}/api/profile-media/avatar`);
    expect(icons[0]?.mediaType).toBe("image/*");
  });
});
