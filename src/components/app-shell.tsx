import Link from "next/link";
import { Bell, Home, LogIn, Search, Settings, ShieldCheck, UserPlus, Users } from "lucide-react";
import { signOutAction } from "@/features/auth/actions";
import { defaultSiteSettings, getSiteSettings } from "@/features/site/settings";
import type { profiles } from "@/db/schema";

type Profile = typeof profiles.$inferSelect;

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/local", label: "Local", icon: Users },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings/profile", label: "Settings", icon: Settings },
];

export async function AppShell({
  profile,
  siteName,
  children,
}: {
  profile: Profile;
  siteName?: string;
  children: React.ReactNode;
}) {
  const settings = siteName ? null : await getSiteSettings();
  const shellSiteName = siteName ?? settings?.siteName ?? defaultSiteSettings.siteName;

  return (
    <ShellFrame
      sidebar={
        <>
          <SidebarBrand siteName={shellSiteName} />
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            {profile.isAdmin ? (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                <ShieldCheck className="size-4" />
                Admin
              </Link>
            ) : null}
          </nav>
          <form action={signOutAction} className="mt-8">
            <button className="rounded-md px-2 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
              Sign out
            </button>
          </form>
        </>
      }
      mobileNav={
        <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-zinc-200 bg-white md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] text-zinc-600"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </ShellFrame>
  );
}

export async function PublicAppShell({
  siteName,
  children,
}: {
  siteName?: string;
  children: React.ReactNode;
}) {
  const settings = siteName ? null : await getSiteSettings();
  const shellSiteName = siteName ?? settings?.siteName ?? defaultSiteSettings.siteName;
  const publicNavItems = [
    { href: "/login", label: "Sign in", icon: LogIn },
    { href: "/register", label: "Register", icon: UserPlus },
  ];

  return (
    <ShellFrame
      sidebar={
        <>
          <SidebarBrand siteName={shellSiteName} />
          <nav className="flex flex-col gap-1">
            {publicNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      }
      mobileNav={
        <nav className="fixed inset-x-0 bottom-0 grid grid-cols-2 border-t border-zinc-200 bg-white md:hidden">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] text-zinc-600"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </ShellFrame>
  );
}

function ShellFrame({
  sidebar,
  mobileNav,
  children,
}: {
  sidebar: React.ReactNode;
  mobileNav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-zinc-200 bg-white px-3 py-4 max-md:hidden">{sidebar}</aside>
        <main className="min-w-0 border-r border-zinc-200 bg-white">{children}</main>
        {mobileNav}
      </div>
    </div>
  );
}

function SidebarBrand({ siteName }: { siteName: string }) {
  return (
    <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-xl font-semibold">
      {siteName}
    </Link>
  );
}
