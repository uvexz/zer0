import { AppShell } from "@/components/app-shell";
import { Button, Input, Textarea } from "@/components/kumo";
import { updateProfileAction } from "@/features/accounts/actions";
import { requireUser } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { profile } = await requireUser();
  return (
    <AppShell profile={profile}>
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>
      <form action={updateProfileAction} className="max-w-xl space-y-4 p-4">
        <Input name="displayName" label="Display name" defaultValue={profile.displayName} required />
        <Textarea name="bio" label="Bio" defaultValue={profile.bio} className="min-h-28" />
        <Button type="submit" variant="primary">Save profile</Button>
      </form>
    </AppShell>
  );
}
