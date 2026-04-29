"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard } from "@/components/kumo";

type RegisterFormProps = {
  isBootstrapRegistration: boolean;
};

export function RegisterForm({ isBootstrapRegistration }: RegisterFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <LayerCard className="w-full max-w-md p-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const response = await fetch("/api/auth/sign-up/email", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
                name: String(formData.get("name") ?? ""),
                username: String(formData.get("username") ?? ""),
                inviteCode: String(formData.get("inviteCode") ?? ""),
              }),
            });

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              setError(payload?.error ?? payload?.message ?? "Registration failed.");
              return;
            }

            router.push("/");
            router.refresh();
          });
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Create Zer0 account</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isBootstrapRegistration
              ? "Create the first account to bootstrap this instance."
              : "Enter your invite to create an account."}
          </p>
        </div>
        <Input name="name" label="Display name" required />
        <Input name="username" label="Username" required pattern="[a-zA-Z0-9_]{2,32}" />
        <Input name="email" label="Email" type="email" required />
        <Input name="password" label="Password" type="password" minLength={8} required />
        {isBootstrapRegistration ? null : (
          <Input
            name="inviteCode"
            label="Invite code"
            required
          />
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" variant="primary" loading={isPending} className="w-full">
          Register
        </Button>
      </form>
    </LayerCard>
  );
}
