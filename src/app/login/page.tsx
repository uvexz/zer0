import Link from "next/link";
import { PublicAppShell } from "@/components/app-shell";
import { Button, Input, LayerCard } from "@/components/kumo";
import { signInAction } from "@/features/auth/actions";
import { getSiteSettings } from "@/features/site/settings";
import { PasskeyButton } from "./passkey-button";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const settings = await getSiteSettings();

  return (
    <PublicAppShell siteName={settings.siteName}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LayerCard className="w-full max-w-md p-5">
          <form action={signInAction} className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Sign in to {settings.siteName}</h1>
              <p className="mt-1 text-sm text-zinc-500">{settings.siteDescription}</p>
            </div>
            <Input name="email" label="Email" type="email" autoComplete="username webauthn" required />
            <Input name="password" label="Password" type="password" autoComplete="current-password webauthn" required />
            <Button type="submit" variant="primary" className="w-full">
              Sign in
            </Button>
            <PasskeyButton />
            <p className="text-sm text-zinc-500">
              Need an account? <Link href="/register" className="font-medium text-zinc-900">Use an invite</Link>
              {" "}
              <span className="text-zinc-300">·</span>
              {" "}
              <Link href="/forgot-password" className="font-medium text-zinc-900">Forgot password?</Link>
            </p>
          </form>
        </LayerCard>
      </div>
    </PublicAppShell>
  );
}
