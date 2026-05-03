import Link from "next/link";

const adminItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/blocks", label: "Blocks" },
  { href: "/admin/federation", label: "Federation" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-zinc-200 px-4 py-2 text-sm">
      {adminItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`shrink-0 rounded-md px-2 py-1 ${
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
