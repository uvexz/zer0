export const DEFAULT_AVATAR_URL = "/zer0.png";

export function Avatar({
  src,
  alt = "",
  size = "md",
}: {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
}) {
  const className = {
    sm: "size-10",
    md: "size-12",
    lg: "size-14",
  }[size];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || DEFAULT_AVATAR_URL}
      alt={alt}
      className={`${className} shrink-0 rounded-md border border-zinc-200 bg-white object-cover`}
    />
  );
}
