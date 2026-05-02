"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Collapsible } from "@/components/kumo";

export function AccountHandleCollapsible({
  displayHandle,
  fullHandle,
}: {
  displayHandle: string;
  fullHandle: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyHandle() {
    await navigator.clipboard.writeText(fullHandle);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Collapsible label={displayHandle} open={open} onOpenChange={setOpen} className="space-y-2">
      <button
        type="button"
        onClick={copyHandle}
        className="inline-flex max-w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-mono text-xs text-zinc-700 hover:bg-zinc-100"
      >
        <span className="truncate">{fullHandle}</span>
        {copied ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
      </button>
      <p className="text-xs leading-5 text-zinc-500">
        Not on this site? Search this account in Mastodon or another fediverse app to follow this user.
      </p>
    </Collapsible>
  );
}
