import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export type Bucket = "site-media" | "screens";

export function publicMediaUrl(path: string): string {
  const e = env();
  if (e.STORAGE_DRIVER === "local") return `${e.APP_ORIGIN}/storage/site-media/${path}`;
  return `${e.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-media/${path}`;
}

export function storageOrigin(): string {
  const e = env();
  return e.STORAGE_DRIVER === "local" ? e.APP_ORIGIN : new URL(e.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").origin;
}

export async function readObject(bucket: Bucket, path: string): Promise<Buffer | null> {
  if (path.includes("..")) return null;
  const e = env();
  if (e.STORAGE_DRIVER === "local") {
    const root = resolve(process.cwd(), e.LOCAL_STORAGE_DIR, bucket);
    const file = resolve(root, path);
    if (!file.startsWith(`${root}/`)) return null;
    return readFile(file).catch(() => null);
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
