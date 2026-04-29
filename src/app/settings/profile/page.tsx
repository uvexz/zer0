import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
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
        <div className="overflow-hidden rounded-md border border-zinc-200">
          {profile.headerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.headerUrl} alt="" className="h-32 w-full object-cover" />
          ) : (
            <div className="h-32 bg-zinc-100" />
          )}
          <div className="-mt-8 px-4 pb-4">
            <div className="w-fit rounded-md border-4 border-white">
              <Avatar src={profile.avatarUrl} alt="" size="lg" />
            </div>
          </div>
        </div>
        <Input name="displayName" label="Display name" defaultValue={profile.displayName} required />
        <Textarea name="bio" label="Bio" defaultValue={profile.bio} className="min-h-28" />
        <Input
          type="file"
          name="avatar"
          label="Avatar"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <Input
          type="file"
          name="header"
          label="Header image"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <Button type="submit" variant="primary">Save profile</Button>
      </form>
    </AppShell>
  );
}
