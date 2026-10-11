import { createHash } from "node:crypto";
import sharp from "sharp";
import { safeFetch, type GuardOptions } from "./ssrf";

export const VARIANT_WIDTHS = [480, 960, 1440, 2048] as const;

export interface MediaVariant {
  width: number;
  height: number;
  format: "webp" | "avif" | "jpeg" | "png";
  path: string;
}

export interface ProcessedMedia {
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** Path of the normalized original (jpeg/png). */
  path: string;
  variants: MediaVariant[];
  /** Small blurred placeholder data URI (LQIP) for perceived performance. */
  placeholder: string;
}

export interface MediaStore {
  put(path: string, body: Buffer, contentType: string): Promise<void>;
}

/**
 * Downloads one image through the SSRF guard, rasterizes SVG (so no active SVG content is ever
 * re-hosted), strips metadata and writes responsive WebP + AVIF variants.
 */
export async function processImage(
  url: string,
  basePath: string,
  store: MediaStore,
  opts: GuardOptions & { maxBytes?: number } = {},
): Promise<ProcessedMedia> {
  const res = await safeFetch(url, { ...opts, maxBytes: opts.maxBytes ?? 15_000_000, accept: ["image/"], timeoutMs: 25_000 });
  if (res.status >= 400) throw new Error(`Image request failed with ${res.status}`);
  return processImageBuffer(res.body, res.contentType, basePath, store);
}

export async function processImageBuffer(
  input: Buffer,
  contentType: string,
  basePath: string,
  store: MediaStore,
): Promise<ProcessedMedia> {
  const isSvg = contentType.includes("svg") || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(input.subarray(0, 512).toString("utf8"));
  const image = sharp(input, { density: isSvg ? 288 : undefined, failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image.");
  const hasAlpha = !!meta.hasAlpha;
  const sha256 = createHash("sha256").update(input).digest("hex");
  const variants: MediaVariant[] = [];

  const originalFormat = hasAlpha ? "png" : "jpeg";
  const original = hasAlpha
    ? await image.clone().resize({ width: Math.min(meta.width, 2560), withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await image.clone().resize({ width: Math.min(meta.width, 2560), withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const originalPath = `${basePath}/original.${originalFormat === "png" ? "png" : "jpg"}`;
  await store.put(originalPath, original.data, `image/${originalFormat}`);

  const widths: number[] = VARIANT_WIDTHS.filter((w) => w < original.info.width);
  widths.push(original.info.width);
  for (const width of [...new Set(widths)]) {
    const resized = image.clone().resize({ width, withoutEnlargement: true });
    const webp = await resized.clone().webp({ quality: 80, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
    const webpPath = `${basePath}/${width}.webp`;
    await store.put(webpPath, webp.data, "image/webp");
    variants.push({ width: webp.info.width, height: webp.info.height, format: "webp", path: webpPath });
    if (width <= 1440) {
      const avif = await resized.clone().avif({ quality: 55, effort: 3 }).toBuffer({ resolveWithObject: true });
      const avifPath = `${basePath}/${width}.avif`;
      await store.put(avifPath, avif.data, "image/avif");
      variants.push({ width: avif.info.width, height: avif.info.height, format: "avif", path: avifPath });
    }
  }
  const lqip = await image.clone().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  return {
    mime: `image/${originalFormat}`,
    width: original.info.width,
    height: original.info.height,
    bytes: input.byteLength,
    sha256,
    path: originalPath,
    variants,
    placeholder: `data:image/webp;base64,${lqip.toString("base64")}`,
  };
}
