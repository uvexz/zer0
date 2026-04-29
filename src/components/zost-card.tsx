import Link from "next/link";
import { Bookmark, Heart, Repeat2, Reply, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/kumo";
import {
  announceZostAction,
  bookmarkZostAction,
  deleteZostAction,
  likeZostAction,
} from "@/features/posts/actions";
import { mediaDisplayUrl, shouldFoldSensitiveMedia } from "@/features/media/service";
import type { ZostListItem } from "@/features/posts/queries";

export function ZostCard({ item, showThreadLink = true }: { item: ZostListItem; showThreadLink?: boolean }) {
  const post = item.post;
  const author = item.author;

  return (
    <article className="border-b border-zinc-200 px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <AuthorLink author={author} />
        <Badge variant="secondary">{post.visibility}</Badge>
      </div>
      <div
        className="prose prose-zinc max-w-none text-sm leading-6"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
      {item.media.length ? (
        shouldFoldSensitiveMedia(item.media.some((media) => media.sensitive)) ? (
          <details className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-700">
              Sensitive media
            </summary>
            <MediaGrid media={item.media} />
          </details>
        ) : (
          <MediaGrid media={item.media} />
        )
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-zinc-500">
        {showThreadLink ? (
          item.author.isRemote ? (
            <a href={item.postHref} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Open thread">
              <Reply className="size-4" />
            </a>
          ) : (
            <Link href={item.postHref} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Open thread">
              <Reply className="size-4" />
            </Link>
          )
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

function MediaGrid({ media }: { media: ZostListItem["media"] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {media.map((asset) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={asset.id}
          src={mediaDisplayUrl({
            mediaId: asset.id,
            storageKey: asset.storageKey,
            variant: "preview",
          })}
          alt={asset.altText}
          className="aspect-video rounded-md border border-zinc-200 object-cover"
        />
      ))}
    </div>
  );
}

function AuthorLink({ author }: { author: ZostListItem["author"] }) {
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={author.avatarUrl} alt="" size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{author.displayName}</div>
        <div className="truncate text-xs text-zinc-500">{author.handle}</div>
      </div>
    </div>
  );

  return (
    <Link href={author.href} className="min-w-0">
      {content}
    </Link>
  );
}
