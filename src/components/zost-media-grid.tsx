"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type ZostMediaGridItem = {
  id: string;
  thumbnailUrl: string;
  fullUrl: string;
  altText: string;
};

export function ZostMediaGrid({ media }: { media: ZostMediaGridItem[] }) {
  const titleId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeMedia = activeIndex === null ? null : media[activeIndex] ?? null;
  const hasMultiple = media.length > 1;

  const closeLightbox = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const showRelativeMedia = useCallback((offset: number) => {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex;
      return (currentIndex + offset + media.length) % media.length;
    });
  }, [media.length]);

  useEffect(() => {
    if (activeIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }
      if (!hasMultiple) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showRelativeMedia(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showRelativeMedia(1);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, closeLightbox, hasMultiple, showRelativeMedia]);

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {media.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            className="group aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
            aria-label={asset.altText ? `View image: ${asset.altText}` : "View image"}
            onClick={() => setActiveIndex(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.thumbnailUrl}
              alt={asset.altText}
              className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      {activeMedia ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={(event) => {
            if (event.currentTarget === event.target) closeLightbox();
          }}
        >
          <h2 id={titleId} className="sr-only">
            Image viewer
          </h2>
          <button
            type="button"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
            aria-label="Close image viewer"
            onClick={closeLightbox}
          >
            <X className="size-5" />
          </button>

          {hasMultiple ? (
            <button
              type="button"
              className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
              aria-label="Previous image"
              onClick={() => showRelativeMedia(-1)}
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}

          <figure className="flex max-h-full max-w-full flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeMedia.fullUrl}
              alt={activeMedia.altText}
              className="max-h-[calc(100vh-6rem)] max-w-[calc(100vw-2rem)] rounded-md object-contain shadow-2xl"
            />
            {activeMedia.altText ? (
              <figcaption className="mt-3 max-w-[min(42rem,calc(100vw-2rem))] text-center text-sm text-zinc-100">
                {activeMedia.altText}
              </figcaption>
            ) : null}
          </figure>

          {hasMultiple ? (
            <button
              type="button"
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
              aria-label="Next image"
              onClick={() => showRelativeMedia(1)}
            >
              <ChevronRight className="size-5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
