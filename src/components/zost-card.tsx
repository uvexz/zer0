import Link from "next/link";
import { Bookmark, Heart, Repeat2, Reply, Trash2 } from "lucide-react";
import { Badge } from "@/components/kumo";
import {
  announceZostAction,
  bookmarkZostAction,
  deleteZostAction,
  likeZostAction,
} from "@/features/posts/actions";
import type { ZostListItem } from "@/features/posts/queries";

export function ZostCard({ item, showThreadLink = true }: { item: ZostListItem; showThreadLink?: boolean }) {
  const post = item.post;
  const profile = item.profile;
  const postHref = `/@${profile.username}/${post.id}`;

  return (
    <article className="border-b border-zinc-200 px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Link href={`/@${profile.username}`} className="min-w-0">
          <div className="truncate text-sm font-semibold">{profile.displayName}</div>
          <div className="truncate text-xs text-zinc-500">@{profile.username}</div>
        </Link>
        <Badge variant="secondary">{post.visibility}</Badge>
      </div>
      <div
        className="prose prose-zinc max-w-none text-sm leading-6"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
      {item.media.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {item.media.map((media) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={media.id}
              src={`/api/media/${media.id}`}
              alt={media.altText}
              className="aspect-video rounded-md border border-zinc-200 object-cover"
            />
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-zinc-500">
        {showThreadLink ? (
          <Link href={postHref} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Open thread">
            <Reply className="size-4" />
          </Link>
        ) : null}
        <form action={likeZostAction}>
          <input type="hidden" name="postId" value={post.id} />
          <button className="rounded-md p-1 hover:bg-zinc-100" aria-label="Like">
            <Heart className="size-4" />
          </button>
        </form>
        <form action={announceZostAction}>
          <input type="hidden" name="postId" value={post.id} />
          <button className="rounded-md p-1 hover:bg-zinc-100" aria-label="Announce">
            <Repeat2 className="size-4" />
          </button>
        </form>
        <form action={bookmarkZostAction}>
          <input type="hidden" name="postId" value={post.id} />
          <button className="rounded-md p-1 hover:bg-zinc-100" aria-label="Bookmark">
            <Bookmark className="size-4" />
          </button>
        </form>
        {item.canDelete ? (
          <form action={deleteZostAction} className="ml-auto">
            <input type="hidden" name="postId" value={post.id} />
            <button className="rounded-md p-1 text-red-600 hover:bg-red-50" aria-label="Delete">
              <Trash2 className="size-4" />
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
