import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { env, type Env } from "./env";

export type Bucket = "site-media" | "screens";

/** Local and S3 objects are served by this app (/storage/site-media); Supabase serves its public bucket. */
const servedByApp = (e: Env) => e.STORAGE_DRIVER === "local" || e.STORAGE_DRIVER === "s3";

export function publicMediaUrl(path: string): string {
  const e = env();
  if (servedByApp(e)) return `${e.APP_ORIGIN}/storage/site-media/${path}`;
  return `${e.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-media/${path}`;
}

export function storageOrigin(): string {
  const e = env();
  return servedByApp(e) ? e.APP_ORIGIN : new URL(e.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").origin;
}

let s3: S3Client | null = null;
function s3Client(e: Env): S3Client {
  s3 ??= new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
  });
  return s3;
}

export async function readObject(bucket: Bucket, path: string): Promise<Buffer | null> {
  if (path.split("/").some((part) => part === ".." || part === "")) return null;
  const e = env();
  if (e.STORAGE_DRIVER === "local") {
    const root = resolve(/*turbopackIgnore: true*/ process.cwd(), e.LOCAL_STORAGE_DIR, bucket);
    const file = resolve(/*turbopackIgnore: true*/ root, path);
    if (!file.startsWith(`${root}/`)) return null;
    return readFile(file).catch(() => null);
  }
  if (e.STORAGE_DRIVER === "s3") {
    try {
      const res = await s3Client(e).send(new GetObjectCommand({ Bucket: e.S3_BUCKET!, Key: `${bucket}/${path}` }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }
  const client = createClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await client.storage.from(bucket).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

export function contentTypeFor(path: string): string {
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".avif")) return "image/avif";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}
