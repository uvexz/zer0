"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Input } from "@/components/kumo";
import {
  resetPasswordAction,
  type PasswordResetActionState,
} from "@/features/auth/actions";

const initialState: PasswordResetActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState,
  );

  if (state.message) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {state.message}
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/login" className="font-medium text-zinc-900">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Input
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Input
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" variant="primary" loading={isPending} className="w-full">
        Update password
      </Button>
    </form>
  );
}
