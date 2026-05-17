"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/features/auth/auth";
import {
  isPasswordResetEmailConfigured,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
} from "@/features/auth/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

export type PasswordResetActionState = {
  error?: string;
  message?: string;
};

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  await auth.api.signInEmail({
    body: {
      email,
      password,
      rememberMe: true,
    },
    headers: await headers(),
  });

  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({
    headers: await headers(),
  });

  redirect("/login");
}

export async function requestPasswordResetAction(
  _previousState: PasswordResetActionState,
  formData: FormData,
): Promise<PasswordResetActionState> {
  if (!isPasswordResetEmailConfigured()) {
    return { error: PASSWORD_RESET_UNAVAILABLE_MESSAGE };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const requestHeaders = await headers();
  const rateLimit = await checkRateLimit(`auth:password-reset:${clientAddressFromHeaders(requestHeaders)}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.ok) {
    return { error: "Too many password reset requests. Try again later." };
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: `${env.APP_ORIGIN.replace(/\/$/, "")}/reset-password`,
      },
      headers: requestHeaders,
    });

    return {
      message: "If that email belongs to an account, check your inbox for a reset link.",
    };
  } catch {
    return { error: "Unable to send a reset link. Try again later." };
  }
}

export async function resetPasswordAction(
  _previousState: PasswordResetActionState,
  formData: FormData,
): Promise<PasswordResetActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "This reset link is invalid or expired." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: password,
        token,
      },
      headers: await headers(),
    });

    return { message: "Password updated. You can sign in now." };
  } catch {
    return { error: "This reset link is invalid or expired." };
  }
}

function clientAddressFromHeaders(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return requestHeaders.get("x-real-ip") ?? "unknown";
}
