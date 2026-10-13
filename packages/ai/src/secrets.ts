import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for settings stored in the database (app_settings), e.g. the Anthropic API key entered in
 * the app. AES-256-GCM with a key derived from SESSION_SECRET (set by the all-in-one launcher), falling
 * back to DATABASE_URL, the same on the web app and the worker. Separate entry point (no SDK imports) so
 * the web app can use it.
 */
export const ANTHROPIC_KEY_SETTING = "anthropic_api_key";

type Source = Record<string, string | undefined>;

function key(source: Source): Buffer {
  const base = source["SESSION_SECRET"] || source["DATABASE_URL"];
  if (!base) throw new Error("No SESSION_SECRET or DATABASE_URL to derive the settings key from");
  return createHash("sha256").update(`rd-settings:${base}`).digest();
}

export function encryptSetting(plain: string, source: Source = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(source), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** Null when the value cannot be decrypted (e.g. the secret changed); callers treat it as not set. */
export function decryptSetting(value: string, source: Source = process.env): string | null {
  try {
    if (!value.startsWith("v1:")) return null;
    const raw = Buffer.from(value.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(source), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
