"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/kumo";
import { authClient } from "@/features/auth/client";

type ConditionalCredential = typeof PublicKeyCredential & {
  isConditionalMediationAvailable?: () => Promise<boolean>;
};

export function PasskeyButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const signInWithPasskey = useCallback((options?: { autoFill?: boolean; silent?: boolean }) => {
    startTransition(async () => {
      setError(null);

      const result = await authClient.signIn.passkey({
        autoFill: options?.autoFill,
      });

      if (result.error) {
        if (!options?.silent && !isCancellation(result.error)) {
          setError(result.error.message ?? "Passkey sign-in failed.");
        }
        return;
      }

      router.push("/");
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const credential = window.PublicKeyCredential as ConditionalCredential | undefined;
    if (!credential?.isConditionalMediationAvailable) return;

    void credential
      .isConditionalMediationAvailable()
      .then((isAvailable) => {
        if (!isAvailable) return;
        void signInWithPasskey({ autoFill: true, silent: true });
      })
      .catch(() => undefined);
  }, [signInWithPasskey]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        loading={isPending}
        className="w-full"
        onClick={() => signInWithPasskey()}
      >
        <KeyRound aria-hidden size={16} />
        Sign in with passkey
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function isCancellation(error: { message?: string; code?: string }) {
  return error.code === "AUTH_CANCELLED";
}
