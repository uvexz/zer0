import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

export interface StorageAdapter {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
  createReadUrl(key: string): Promise<string>;
  createWriteUrl(key: string): Promise<string>;
}

class LocalStorageAdapter implements StorageAdapter {
  async putObject(key: string, bytes: Uint8Array) {
    const path = join(env.MEDIA_LOCAL_DIR, key);
    await mkdir(join(path, ".."), { recursive: true });
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
}

export const storage: StorageAdapter = new LocalStorageAdapter();
