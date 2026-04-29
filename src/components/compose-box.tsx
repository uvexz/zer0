"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus } from "lucide-react";
import { Button, Input, Textarea } from "@/components/kumo";
import {
  createZostAction,
  type CreateZostActionState,
} from "@/features/posts/actions";
import {
  formatBytes,
  ZOST_CONTENT_MAX_CHARS,
  ZOST_MEDIA_ALLOWED_TYPES,
  ZOST_MEDIA_MAX_BYTES,
  ZOST_MEDIA_MAX_FILES,
  ZOST_MEDIA_TOTAL_MAX_BYTES,
} from "@/features/posts/compose-limits";
import { VisibilityPicker } from "./visibility-picker";

const initialState: CreateZostActionState = {};

type MediaPreview = {
  name: string;
  size: number;
  url: string;
};

export function ComposeBox({ replyToPostId }: { replyToPostId?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const mediaUrlsRef = useRef<string[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [contentLength, setContentLength] = useState(0);
  const [mediaLabel, setMediaLabel] = useState("Attach images");
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  const [hideServerError, setHideServerError] = useState(false);

  useEffect(
    () => () => {
      for (const url of mediaUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  function clearMediaPreviews() {
    for (const url of mediaUrlsRef.current) URL.revokeObjectURL(url);
    mediaUrlsRef.current = [];
    setMediaPreviews([]);
  }

  function updateMediaPreviews(files: File[]) {
    for (const url of mediaUrlsRef.current) URL.revokeObjectURL(url);

    const previews = files.map((file) => ({
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    mediaUrlsRef.current = previews.map((preview) => preview.url);
    setMediaPreviews(previews);
  }

  const [state, formAction] = useActionState(
    async (previousState: CreateZostActionState, formData: FormData) => {
      const result = await createZostAction(previousState, formData);
      setHideServerError(false);
      if (result.ok) {
        formRef.current?.reset();
        setClientError(null);
        setContentLength(0);
        setMediaLabel("Attach images");
        clearMediaPreviews();
      }
      return result;
    },
    initialState,
  );
  const message = clientError ?? (hideServerError ? undefined : state.error);

  function validateFiles(files: File[]) {
    if (files.length > ZOST_MEDIA_MAX_FILES) {
      return `Attach at most ${ZOST_MEDIA_MAX_FILES} images.`;
    }

    const totalMediaBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalMediaBytes > ZOST_MEDIA_TOTAL_MAX_BYTES) {
      return `Attached images must be ${formatBytes(ZOST_MEDIA_TOTAL_MAX_BYTES)} total or smaller.`;
    }

    for (const file of files) {
      if (
        !ZOST_MEDIA_ALLOWED_TYPES.includes(
          file.type as (typeof ZOST_MEDIA_ALLOWED_TYPES)[number],
        )
      ) {
        return `${file.name} is not supported. Use JPEG, PNG, WebP, or GIF.`;
      }
      if (file.size > ZOST_MEDIA_MAX_BYTES) {
        return `${file.name} is too large. Each image must be ${formatBytes(ZOST_MEDIA_MAX_BYTES)} or smaller.`;
      }
    }

    return null;
  }

  function filesFromForm(form: HTMLFormElement) {
    return new FormData(form)
      .getAll("media")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );
  }

  function validateForm(form: HTMLFormElement) {
    const formData = new FormData(form);
    const content = String(formData.get("content") ?? "").trim();

    if (!content) return "Write something before publishing.";
    if (content.length > ZOST_CONTENT_MAX_CHARS) {
      return `Zosts can be at most ${ZOST_CONTENT_MAX_CHARS} characters. This one has ${content.length}.`;
    }

    return validateFiles(filesFromForm(form));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-b border-zinc-200 p-4"
      onSubmit={(event) => {
        const error = validateForm(event.currentTarget);
        setClientError(error);
        setHideServerError(Boolean(error));
        if (error) event.preventDefault();
      }}
    >
      {replyToPostId ? (
        <input type="hidden" name="replyToPostId" value={replyToPostId} />
      ) : null}
      <div className="relative">
        <Textarea
          name="content"
          aria-label="Write a zost"
          placeholder="Write a zost..."
          required
          maxLength={ZOST_CONTENT_MAX_CHARS}
          className="min-h-40 w-full resize-y pb-14"
          onChange={(event) => {
            setContentLength(event.currentTarget.value.length);
            if (clientError) setClientError(null);
            if (state.error) setHideServerError(true);
          }}
        />
        <div className="absolute inset-x-3 bottom-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              aria-label={mediaLabel}
              title={mediaLabel}
              className="relative flex size-8 cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
            >
              <ImagePlus aria-hidden="true" className="size-4" />
              {mediaPreviews.length ? (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-zinc-900 px-1 text-[10px] leading-4 text-white">
                  {mediaPreviews.length}
                </span>
              ) : null}
              <input
                type="file"
                name="media"
                aria-label="Upload images"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = filesFromForm(event.currentTarget.form!);
                  const error = validateFiles(files);
                  setClientError(error);
                  setMediaLabel(
                    files.length
                      ? `${files.length} image${files.length === 1 ? "" : "s"} selected`
                      : "Attach images",
                  );
                  updateMediaPreviews(files);
                  if (state.error) setHideServerError(true);
                }}
              />
            </label>
            <VisibilityPicker iconOnly />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {contentLength}/{ZOST_CONTENT_MAX_CHARS}
            </span>
            <PublishButton />
          </div>
        </div>
      </div>
      {message ? (
        <p
          role="alert"
          className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {message}
        </p>
      ) : null}
      {mediaPreviews.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {mediaPreviews.map((preview, index) => (
            <div
              key={preview.url}
              className="overflow-hidden rounded-md border border-zinc-200 bg-white"
            >
              <div className="relative aspect-video bg-zinc-100">
                {/* Object URLs are local previews and should not go through Next image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt=""
                  className="size-full object-cover"
                />
                <label className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white/95 px-2 py-1 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    name="mediaSensitive"
                    value={index}
                    className="size-3.5 rounded border-zinc-300"
                  />
                  Sensitive
                </label>
              </div>
              <div className="grid gap-2 p-2">
                <div className="min-w-0 text-xs text-zinc-500">
                  <p className="truncate text-zinc-700">{preview.name}</p>
                  <p>{formatBytes(preview.size)}</p>
                </div>
                <Input
                  name="mediaAltText"
                  aria-label={`Alt text for ${preview.name}`}
                  placeholder="Alt text"
                  size="sm"
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-zinc-500">
        Up to {ZOST_MEDIA_MAX_FILES} images, {formatBytes(ZOST_MEDIA_MAX_BYTES)}{" "}
        each. Direct uses @mentions as recipients; without @mentions, only you
        can see it.
      </div>
    </form>
  );
}

function PublishButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? "Publishing..." : "Publish"}
    </Button>
  );
}
