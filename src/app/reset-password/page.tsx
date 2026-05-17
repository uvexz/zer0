import Link from "next/link";
import { PublicAppShell } from "@/components/app-shell";
import { LayerCard } from "@/components/kumo";
import { getSiteSettings } from "@/features/site/settings";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const settings = await getSiteSettings();
  const params = await searchParams;
  const token = singleValue(params.token);
  const error = singleValue(params.error);
  const isInvalidToken = error === "INVALID_TOKEN" || !token;

  return (
    <PublicAppShell siteName={settings.siteName}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LayerCard className="w-full max-w-md p-5">
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Set a new password</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Choose a new password for your {settings.siteName} account.
              </p>
            </div>
            {isInvalidToken ? (
              <div className="space-y-3">
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  This reset link is invalid or expired.
                </p>
                <p className="text-sm text-zinc-500">
                  <Link href="/forgot-password" className="font-medium text-zinc-900">Request a new link</Link>
                </p>
              </div>
            ) : (
              <ResetPasswordForm token={token} />
            )}
          </div>
        </LayerCard>
      </div>
    </PublicAppShell>
  );
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
