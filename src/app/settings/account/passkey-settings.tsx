"use client";

import { useState, useTransition } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard } from "@/components/kumo";
import { authClient } from "@/features/auth/client";

export type PasskeySummary = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
};

type PasskeySettingsProps = {
  initialPasskeys: PasskeySummary[];
  defaultName: string;
};

export function PasskeySettings({ initialPasskeys, defaultName }: PasskeySettingsProps) {
  const router = useRouter();
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addPasskey() {
    startTransition(async () => {
      setError(null);

      if (!window.PublicKeyCredential) {
        setError("This browser does not support passkeys.");
        return;
      }

      const result = await authClient.passkey.addPasskey({
        name: name.trim() || undefined,
      });

      if (result.error) {
        setError(result.error.message ?? "Could not add passkey.");
        return;
      }

      setPasskeys((current) => [toSummary(result.data), ...current]);
      setName(defaultName);
      router.refresh();
    });
  }

  function deletePasskey(id: string) {
    startTransition(async () => {
      setError(null);

      const response = await fetch("/api/auth/passkey/delete-passkey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? payload?.message ?? "Could not delete passkey.");
        return;
      }

      setPasskeys((current) => current.filter((passkey) => passkey.id !== id));
      router.refresh();
    });
  }

  return (
    <LayerCard className="max-w-xl p-4">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden size={18} />
        <h2 className="font-medium">Passkeys</h2>
      </div>
      <div className="mt-4 space-y-3">
        <Input
          name="passkeyName"
          label="Passkey name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Button type="button" variant="primary" loading={isPending} onClick={addPasskey}>
          <KeyRound aria-hidden size={16} />
          Add passkey
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="mt-5 divide-y divide-zinc-200 border-t border-zinc-200">
        {passkeys.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">No passkeys added yet.</p>
        ) : (
          passkeys.map((passkey) => (
            <div key={passkey.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{passkey.name || "Unnamed passkey"}</div>
                <div className="text-xs text-zinc-500">
                  {passkey.deviceType} · {passkey.backedUp ? "backed up" : "not backed up"} ·{" "}
                  {new Date(passkey.createdAt).toLocaleDateString()}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary-destructive"
                size="sm"
                disabled={isPending}
                onClick={() => deletePasskey(passkey.id)}
              >
                <Trash2 aria-hidden size={14} />
                Delete
              </Button>
            </div>
          ))
        )}
      </div>
    </LayerCard>
  );
}

function toSummary(passkey: {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date | string;
}) {
  return {
    id: passkey.id,
    name: passkey.name ?? null,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    createdAt: new Date(passkey.createdAt).toISOString(),
  };
}
