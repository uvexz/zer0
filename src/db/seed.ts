import { db } from "@/db";
import { invites } from "@/db/schema";
import { createId } from "@/lib/id";

async function main() {
  const code = process.env.SEED_INVITE_CODE ?? "ZER0-LOCAL";
  await db
    .insert(invites)
    .values({
      id: createId("invite"),
      code,
      maxUses: 100,
    })
    .onConflictDoNothing();

  console.log(`Seeded invite code: ${code}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
