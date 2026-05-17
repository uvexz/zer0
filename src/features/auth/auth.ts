import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import {
  isAuthEmailConfigured,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "./password-reset";

const appOrigin = env.APP_ORIGIN.replace(/\/$/, "");
const authEmailConfigured = isAuthEmailConfigured();

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
  emailVerification: authEmailConfigured
    ? {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: ({ user, url }) =>
          sendEmailVerificationEmail({
            to: user.email,
            verificationUrl: url,
          }),
      }
    : undefined,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: authEmailConfigured,
    minPasswordLength: 8,
    ...(authEmailConfigured
      ? {
          sendResetPassword: ({ user, url }) =>
            sendPasswordResetEmail({
              to: user.email,
              resetUrl: url,
            }),
        }
      : {}),
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
