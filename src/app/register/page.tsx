import Link from "next/link";
import { PublicAppShell } from "@/components/app-shell";
import { isFirstLocalUser } from "@/features/auth/invites";
import { isAuthEmailConfigured } from "@/features/auth/password-reset";
import { getSiteSettings } from "@/features/site/settings";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const isBootstrapRegistration = await isFirstLocalUser();
  const requiresEmailVerification = isAuthEmailConfigured();
  const settings = await getSiteSettings();

  return (
    <PublicAppShell siteName={settings.siteName}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <RegisterForm
            isBootstrapRegistration={isBootstrapRegistration}
            requiresEmailVerification={requiresEmailVerification}
            siteName={settings.siteName}
          />
          <p className="mt-4 text-center text-sm text-zinc-500">
            {isBootstrapRegistration ? "Already have an account?" : "Already invited?"}{" "}
            <Link className="font-medium text-zinc-900" href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </PublicAppShell>
  );
}
