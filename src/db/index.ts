import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  zer0Sql?: postgres.Sql;
};

const maxConnections = env.DATABASE_MAX_CONNECTIONS ?? (process.env.VERCEL ? 1 : 4);

export const sql =
  globalForDb.zer0Sql ??
  postgres(env.DATABASE_URL, {
    max: maxConnections,
    idle_timeout: 30,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.zer0Sql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };

export function closeDb() {
  return sql.end({ timeout: 5 });
}
