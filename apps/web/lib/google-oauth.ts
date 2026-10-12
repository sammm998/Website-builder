import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

/** Google sign-in for AUTH_DRIVER=password: authorization code flow with PKCE, state and nonce. */

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function googleConfigured(): boolean {
  const e = env();
  return !!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET;
}

export const googleRedirectUri = () => `${env().APP_ORIGIN}/auth/google/callback`;

const b64url = (b: Buffer) => b.toString("base64url");

export function startGoogle(): { url: string; state: string; verifier: string; nonce: string } {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const nonce = b64url(randomBytes(24));
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTHORIZE}?${params}`, state, verifier, nonce };
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  name?: string;
}

export async function finishGoogle(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
  const e = env();
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID!,
      client_secret: e.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google returned no id_token");
  const { payload } = await jwtVerify(id_token, jwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: e.GOOGLE_CLIENT_ID! });
  if (payload["nonce"] !== nonce) throw new Error("Google nonce mismatch");
  if (payload["email_verified"] !== true || typeof payload["email"] !== "string" || !payload.sub) throw new Error("Google account has no verified email");
  return { subject: payload.sub, email: payload["email"], name: typeof payload["name"] === "string" ? payload["name"] : undefined };
}
