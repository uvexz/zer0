"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/kumo";
import {
  requestPasswordResetAction,
  type PasswordResetActionState,
} from "@/features/auth/actions";

const initialState: PasswordResetActionState = {};

export function RequestPasswordResetForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Input name="email" label="Email" type="email" autoComplete="email" required />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <Button type="submit" variant="primary" loading={isPending} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
