import { Button, Input, Textarea } from "@/components/kumo";
import { createZostAction } from "@/features/posts/actions";
import { VisibilityPicker } from "./visibility-picker";

export function ComposeBox({ replyToPostId }: { replyToPostId?: string }) {
  return (
    <form action={createZostAction} className="border-b border-zinc-200 p-4">
      {replyToPostId ? <input type="hidden" name="replyToPostId" value={replyToPostId} /> : null}
      <Textarea
        name="content"
        aria-label="Write a zost"
        placeholder="Write a zost..."
        required
        className="min-h-28 w-full resize-y"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Input
          name="recipientHandles"
          aria-label="Direct recipients"
          placeholder="@alice@example.social"
          size="sm"
        />
        <VisibilityPicker />
        <Button type="submit" variant="primary" size="sm">
          Publish
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Direct zosts use limited-recipient federation; they are not encrypted messages.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input
          type="file"
          name="media"
          aria-label="Upload images"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          size="sm"
        />
        <Input name="altText" aria-label="Alt text" placeholder="Alt text for uploaded images" size="sm" />
      </div>
    </form>
  );
}
