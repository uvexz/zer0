export const zostVisibilities = ["public", "unlisted", "followers", "direct"] as const;
export type ZostVisibility = (typeof zostVisibilities)[number];

export function isZostVisibility(value: unknown): value is ZostVisibility {
  return typeof value === "string" && zostVisibilities.includes(value as ZostVisibility);
}
