import Link from "next/link";
import { PublicAppShell } from "@/components/app-shell";
import { isFirstLocalUser } from "@/features/auth/invites";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const isBootstrapRegistration = await isFirstLocalUser();

  return (
    <PublicAppShell>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <RegisterForm isBootstrapRegistration={isBootstrapRegistration} />
          <p className="mt-4 text-center text-sm text-zinc-500">
            {isBootstrapRegistration ? "Already have an account?" : "Already invited?"}{" "}
            <Link className="font-medium text-zinc-900" href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </PublicAppShell>
  );
}
