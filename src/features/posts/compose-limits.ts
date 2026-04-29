export const ZOST_CONTENT_MAX_CHARS = 5_000;
export const ZOST_MEDIA_MAX_FILES = 4;
export const ZOST_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const ZOST_MEDIA_TOTAL_MAX_BYTES = ZOST_MEDIA_MAX_FILES * ZOST_MEDIA_MAX_BYTES;
export const ZOST_MEDIA_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}
