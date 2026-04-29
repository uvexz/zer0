"use client";

import { useState } from "react";
import { Globe2, Lock, Users, Link2 } from "lucide-react";
import { Select } from "@/components/kumo";
import type { ZostVisibility } from "@/features/posts/types";

const labels: Record<ZostVisibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  followers: "Followers-only",
  direct: "Direct",
};

const icons: Record<ZostVisibility, typeof Globe2> = {
  public: Globe2,
  unlisted: Link2,
  followers: Users,
  direct: Lock,
};

export function VisibilityPicker({
  name = "visibility",
  defaultValue = "public",
  iconOnly = false,
}: {
  name?: string;
  defaultValue?: ZostVisibility;
  iconOnly?: boolean;
}) {
  const [value, setValue] = useState<ZostVisibility>(defaultValue);
  const CurrentIcon = icons[value];

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <Select
        aria-label={`Zost visibility: ${labels[value]}`}
        className={
          iconOnly
            ? "h-8 w-8 justify-center gap-0 px-0 [&>span:last-child]:hidden"
            : undefined
        }
        renderValue={
          iconOnly
            ? () => <CurrentIcon aria-hidden="true" className="size-4" />
            : undefined
        }
        value={value}
        onValueChange={(next) => setValue(next as ZostVisibility)}
        size="sm"
      >
        {Object.entries(labels).map(([key, label]) => (
          <Select.Option key={key} value={key}>
            {label}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}
