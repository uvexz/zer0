import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import type { ZostVisibility } from "@/features/posts/types";

export type StorageDriver = "local" | "s3";
export type MediaVariantType = "original" | "preview" | "thumbnail";

export interface StorageAdapter {
  readonly driver: StorageDriver;
  putObject(key: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
  createReadUrl(key: string): Promise<string>;
  createWriteUrl(key: string): Promise<string>;
  publicUrlForKey(key: string): string | null;
}

class LocalStorageAdapter implements StorageAdapter {
  readonly driver = "local" as const;

  async putObject(key: string, bytes: Uint8Array) {
    const path = join(env.MEDIA_LOCAL_DIR, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async getObject(key: string) {
    return readFile(join(env.MEDIA_LOCAL_DIR, key));
  }

  async deleteObject(key: string) {
    void key;
    // Intentionally left as a no-op in the MVP to avoid deleting media referenced by remote objects.
  }

  async createReadUrl(key: string) {
    return `/api/media/by-key/${encodeURIComponent(key)}`;
  }

  async createWriteUrl(key: string) {
    return `/api/media/by-key/${encodeURIComponent(key)}`;
  }

  publicUrlForKey() {
    return null;
  }
}

class S3StorageAdapter implements StorageAdapter {
  readonly driver = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!env.MEDIA_S3_BUCKET) throw new Error("MEDIA_S3_BUCKET is required when MEDIA_STORAGE_DRIVER=s3.");
    if (!env.MEDIA_S3_ACCESS_KEY_ID) {
      throw new Error("MEDIA_S3_ACCESS_KEY_ID is required when MEDIA_STORAGE_DRIVER=s3.");
    }
    if (!env.MEDIA_S3_SECRET_ACCESS_KEY) {
      throw new Error("MEDIA_S3_SECRET_ACCESS_KEY is required when MEDIA_STORAGE_DRIVER=s3.");
    }

    this.bucket = env.MEDIA_S3_BUCKET;
    this.client = new S3Client({
      region: env.MEDIA_S3_REGION,
      endpoint: env.MEDIA_S3_ENDPOINT,
      forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID,
        secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async putObject(key: string, bytes: Uint8Array, contentType?: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) throw new Error(`S3 object has no body: ${key}`);

    const bytes = await response.Body.transformToByteArray();
    return new Uint8Array(bytes);
  }

  async deleteObject() {
    // Keep deletes disabled for MVP parity with local storage and remote-object safety.
  }

  async createReadUrl(key: string) {
    return this.publicUrlForKey(key) ?? `/api/media/by-key/${encodeURIComponent(key)}`;
  }

  async createWriteUrl(key: string) {
    return this.publicUrlForKey(key) ?? `/api/media/by-key/${encodeURIComponent(key)}`;
  }

  publicUrlForKey(key: string) {
    if (!isPublicMediaKey(key) || !env.MEDIA_S3_PUBLIC_BASE_URL) return null;
    return joinPublicUrl(env.MEDIA_S3_PUBLIC_BASE_URL, key);
  }
}

export function createStorageAdapter(driver: StorageDriver = env.MEDIA_STORAGE_DRIVER): StorageAdapter {
  return driver === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
}

export function mediaKeyPrefixForVisibility(visibility: ZostVisibility) {
  return visibility === "public" || visibility === "unlisted" ? "public" : "protected";
}

export function pendingMediaKey(ownerUserId: string, mediaId: string, extension: string) {
  return `pending/${ownerUserId}/${mediaId}.${extension}`;
}

export function finalizedMediaKey(input: {
  ownerUserId: string;
  mediaId: string;
  extension: string;
  visibility: ZostVisibility;
}) {
  return `${mediaKeyPrefixForVisibility(input.visibility)}/${input.ownerUserId}/${input.mediaId}.${input.extension}`;
}

export function variantStorageKey(originalKey: string, variant: Exclude<MediaVariantType, "original">) {
  const dotIndex = originalKey.lastIndexOf(".");
  const base = dotIndex >= 0 ? originalKey.slice(0, dotIndex) : originalKey;
  return `${base}.${variant}.webp`;
}

export function isPublicMediaKey(key: string) {
  return key.startsWith("public/");
}

export function joinPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export const storage: StorageAdapter = createStorageAdapter();
