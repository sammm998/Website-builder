import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

/** Dev-driver session cookie (HMAC-signed). The Supabase driver uses Supabase's own cookies. */
const COOKIE = "rd_session";
const key = () => new TextEncoder().encode(env().SESSION_SECRET);

export async function createDevSession(userId: string, email: string) {
  const token = await new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("30d").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env().APP_ORIGIN.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function readDevSession(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.sub ? { id: payload.sub, email: String(payload["email"] ?? "") } : null;
  } catch {
    return null;
  }
}

export async function clearDevSession() {
  (await cookies()).delete(COOKIE);
}
