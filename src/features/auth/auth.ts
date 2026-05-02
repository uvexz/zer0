import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { env } from "@/lib/env";

const appOrigin = env.APP_ORIGIN.replace(/\/$/, "");

export const auth = betterAuth({
  appName: "Zer0",
  baseURL: appOrigin,
  secret: env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
  }),
  trustedOrigins: [appOrigin],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  plugins: [
    passkey({
      origin: appOrigin,
      rpName: "Zer0",
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}
