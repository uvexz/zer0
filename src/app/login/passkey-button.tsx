"use client";

import { useCallback, useState } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/kumo";
import { authClient } from "@/features/auth/client";

export function PasskeyButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const signInWithPasskey = useCallback(() => {
    setIsPending(true);

    void (async () => {
      setError(null);

      try {
        const result = await authClient.signIn.passkey();

        if (result.error) {
          if (!isCancellation(result.error)) {
            setError(result.error.message ?? "Passkey sign-in failed.");
          }
          return;
        }

        router.push("/");
        router.refresh();
      } catch (error) {
        if (!isCancellation(error)) {
          setError(error instanceof Error ? error.message : "Passkey sign-in failed.");
        }
      } finally {
        setIsPending(false);
      }
    })();
  }, [router]);

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

function isCancellation(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const value = error as { message?: string; code?: string };
  return value.code === "AUTH_CANCELLED" || value.message === "Authentication was not completed";
}
