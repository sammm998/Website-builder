import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Env } from "./env";

export type Bucket = "site-media" | "screens";

export interface Storage {
  put(bucket: Bucket, path: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: Bucket, path: string): Promise<Buffer>;
  /** Public URL (site-media only; screens are private and read through signed URLs by the app). */
  publicUrl(bucket: Bucket, path: string): string;
}

class LocalStorage implements Storage {
  constructor(private dir: string, private publicBase: string) {}
  private file(bucket: Bucket, path: string) {
    const root = resolve(this.dir, bucket);
    const full = resolve(root, path);
    if (!full.startsWith(`${root}/`)) throw new Error("Invalid storage path");
    return full;
  }
  async put(bucket: Bucket, path: string, body: Buffer) {
    const file = this.file(bucket, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  get(bucket: Bucket, path: string) {
    return readFile(this.file(bucket, path));
  }
  publicUrl(bucket: Bucket, path: string) {
    return `${this.publicBase}/${bucket}/${path}`;
  }
}

class SupabaseStorage implements Storage {
  private client;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async put(bucket: Bucket, path: string, body: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }
  async get(bucket: Bucket, path: string) {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  publicUrl(bucket: Bucket, path: string) {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

export function createStorage(env: Env): Storage {
  if (env.STORAGE_DRIVER === "local") return new LocalStorage(resolve(process.cwd(), env.LOCAL_STORAGE_DIR), env.LOCAL_STORAGE_PUBLIC_URL);
  return new SupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
}

export { LocalStorage };
