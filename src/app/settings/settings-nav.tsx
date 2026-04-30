import Link from "next/link";

const settingsItems = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/federation", label: "Federation" },
];

export function SettingsNav({ current }: { current: string }) {
  return (
    <nav className="flex gap-2 border-b border-zinc-200 px-4 py-2 text-sm">
      {settingsItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md px-2 py-1 ${
            current === item.href
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
