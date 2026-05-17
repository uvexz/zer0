import Link from "next/link";
import { PublicAppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import {
  isPasswordResetEmailConfigured,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
} from "@/features/auth/password-reset";
import { getSiteSettings } from "@/features/site/settings";
import { RequestPasswordResetForm } from "./request-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const settings = await getSiteSettings();
  const canResetPassword = isPasswordResetEmailConfigured();

  return (
    <PublicAppShell siteName={settings.siteName}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LayerCard className="w-full max-w-md p-5">
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Reset your password</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Enter your account email and we will send a reset link.
              </p>
            </div>
            {canResetPassword ? (
              <RequestPasswordResetForm />
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {PASSWORD_RESET_UNAVAILABLE_MESSAGE}
              </p>
            )}
            <p className="text-sm text-zinc-500">
              <Link href="/login" className="font-medium text-zinc-900">Back to sign in</Link>
            </p>
          </div>
        </LayerCard>
      </div>
    </PublicAppShell>
  );
}
