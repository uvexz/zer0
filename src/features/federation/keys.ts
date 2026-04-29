import {
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
} from "@fedify/fedify";
import { CryptographicKey } from "@fedify/fedify/vocab";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actorKeys, actors } from "@/db/schema";
import { createId } from "@/lib/id";

export type LocalActorKeyPair = CryptoKeyPair & {
  keyId: URL;
  cryptographicKey: CryptographicKey;
};

export async function ensureActorKeyPair(actor: typeof actors.$inferSelect) {
  if (actor.type !== "local") {
    throw new Error("Only local actors can have signing keys.");
  }

  const [existing] = await db
    .select()
    .from(actorKeys)
    .where(eq(actorKeys.actorId, actor.id))
    .limit(1);

  if (existing) return importStoredKey(actor.uri, existing);

  const keyId = `${actor.uri}#main-key`;
  const generated = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
  const publicJwk = await exportJwk(generated.publicKey);
  const privateJwk = await exportJwk(generated.privateKey);

  const [stored] = await db
    .insert(actorKeys)
    .values({
      id: createId("actor_key"),
      actorId: actor.id,
      keyId,
      publicJwk,
      privateJwk,
    })
    .onConflictDoUpdate({
      target: actorKeys.actorId,
      set: {
        keyId,
        publicJwk,
        privateJwk,
      },
    })
    .returning();

  return importStoredKey(actor.uri, stored);
}

async function importStoredKey(
  actorUri: string,
  stored: typeof actorKeys.$inferSelect,
): Promise<LocalActorKeyPair> {
  const publicKey = await importJwk(stored.publicJwk as JsonWebKey, "public");
  const privateKey = await importJwk(stored.privateJwk as JsonWebKey, "private");
  const keyId = new URL(stored.keyId);

  return {
    publicKey,
    privateKey,
    keyId,
    cryptographicKey: new CryptographicKey({
      id: keyId,
      owner: new URL(actorUri),
      publicKey,
    }),
  };
}
