import { env } from "@/lib/env";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-white px-4 py-4 text-center text-xs text-zinc-500">
      &copy; {year}{" "}
      <a href={env.APP_ORIGIN} className="font-medium text-zinc-700 hover:text-zinc-950">
        Zer0
      </a>
      {" · "}
      <a
        href="https://github.com/uvexz/zer0"
        className="font-medium text-zinc-700 hover:text-zinc-950"
        rel="noreferrer"
        target="_blank"
      >
        Open Source
      </a>
    </footer>
  );
}
