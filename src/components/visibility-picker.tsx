"use client";

import { useState } from "react";
import { Select } from "@/components/kumo";
import type { ZostVisibility } from "@/features/posts/types";

const labels: Record<ZostVisibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  followers: "Followers-only",
  direct: "Direct",
};

export function VisibilityPicker({
  name = "visibility",
  defaultValue = "public",
}: {
  name?: string;
  defaultValue?: ZostVisibility;
}) {
  const [value, setValue] = useState<ZostVisibility>(defaultValue);

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <Select
        aria-label="Zost visibility"
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
