import Link from "next/link";
import { Button, Input, LayerCard } from "@/components/kumo";
import { signInAction } from "@/features/auth/actions";
import { PasskeyButton } from "./passkey-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <LayerCard className="w-full max-w-md p-5">
        <form action={signInAction} className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Sign in to Zer0</h1>
            <p className="mt-1 text-sm text-zinc-500">Return to your zost timeline.</p>
          </div>
          <Input name="email" label="Email" type="email" autoComplete="username webauthn" required />
          <Input name="password" label="Password" type="password" autoComplete="current-password webauthn" required />
          <Button type="submit" variant="primary" className="w-full">
            Sign in
          </Button>
          <PasskeyButton />
          <p className="text-sm text-zinc-500">
            Need an account? <Link href="/register" className="font-medium text-zinc-900">Use an invite</Link>
          </p>
        </form>
      </LayerCard>
    </main>
  );
}
