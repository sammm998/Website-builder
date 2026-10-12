import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

/** Session cookie for the password and dev drivers (HMAC-signed JWT). Supabase uses its own cookies. */
const COOKIE = "rd_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const key = () => new TextEncoder().encode(env().SESSION_SECRET);
const secure = () => env().APP_ORIGIN.startsWith("https");

export async function createSession(userId: string, email: string) {
  const token = await new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("30d").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: MAX_AGE });
}

export async function readSession(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sub ? { id: payload.sub, email: String(payload["email"] ?? "") } : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** Short-lived signed cookie carrying OAuth state (state, PKCE verifier, nonce, return path). */
const OAUTH_COOKIE = "rd_oauth";

export async function setOAuthState(data: Record<string, string>) {
  const token = await new SignJWT(data).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(key());
  (await cookies()).set(OAUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/auth/google", maxAge: 600 });
}

export async function takeOAuthState(): Promise<Record<string, string> | null> {
  const jar = await cookies();
  const token = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/auth/google" });
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return Object.fromEntries(Object.entries(payload).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return null;
  }
}
