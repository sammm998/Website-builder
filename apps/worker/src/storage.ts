import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

/**
 * S3-compatible bucket (Railway Storage Buckets, R2, MinIO …). The bucket stays private: objects are
 * keyed `<bucket>/<path>` and site media is served publicly by the web app under /storage/site-media.
 */
class S3Storage implements Storage {
  constructor(
    private client: S3Client,
    private bucketName: string,
    private publicBase: string,
  ) {}
  async put(bucket: Bucket, path: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucketName, Key: s3Key(bucket, path), Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
    );
  }
  async get(bucket: Bucket, path: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: s3Key(bucket, path) }));
    if (!res.Body) throw new Error(`Storage download failed: ${bucket}/${path}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }
  publicUrl(bucket: Bucket, path: string) {
    return `${this.publicBase}/${bucket}/${path}`;
  }
}

export function s3Key(bucket: Bucket, path: string): string {
  if (path.split("/").some((part) => part === ".." || part === "")) throw new Error("Invalid storage path");
  return `${bucket}/${path}`;
}

export function s3Client(env: Pick<Env, "S3_ENDPOINT" | "S3_REGION" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY">): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
}

export function createStorage(env: Env): Storage {
  if (env.STORAGE_DRIVER === "local") return new LocalStorage(resolve(process.cwd(), env.LOCAL_STORAGE_DIR), env.LOCAL_STORAGE_PUBLIC_URL);
  if (env.STORAGE_DRIVER === "s3") return new S3Storage(s3Client(env), env.S3_BUCKET!, storagePublicBase(env));
  return new SupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** URL prefix under which the web app serves stored objects (local and s3 drivers). */
export function storagePublicBase(env: Pick<Env, "STORAGE_DRIVER" | "LOCAL_STORAGE_PUBLIC_URL" | "APP_ORIGIN">): string {
  return (env.STORAGE_DRIVER === "local" ? env.LOCAL_STORAGE_PUBLIC_URL : `${env.APP_ORIGIN}/storage`).replace(/\/+$/, "");
}

export { LocalStorage, S3Storage };
