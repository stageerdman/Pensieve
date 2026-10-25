// oauth.ts — Microsoft identity OAuth, authorization-code + PKCE, browser-only.
//
// The phone has no native shell to route around CORS with (the desktop's reason for
// a Rust-side HTTP call — see src/lib/sync/oauth.ts) — it talks to the token
// endpoint with a plain `fetch`, which is exactly why the Azure app needs a
// **Single-page application** redirect entry specifically: that's the platform type
// Microsoft actually serves CORS headers for on /oauth2/v2.0/token.

import { authority, CLIENT_ID, GRAPH_SCOPES, redirectUri } from "./config";

export class TokenError extends Error {
  constructor(
    public status: number,
    public code: string,
    public description: string,
  ) {
    super(`Token request failed (${status}): ${code}${description ? ` — ${description}` : ""}`);
    this.name = "TokenError";
  }
}

export class TransientAuthError extends Error {
  constructor(message = "Can't reach the sign-in service right now.") {
    super(message);
    this.name = "TransientAuthError";
  }
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

export async function createPkce(): Promise<Pkce> {
  const verifier = base64url(randomBytes(32));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function randomState(): string {
  return base64url(randomBytes(16));
}

/** The Microsoft consent URL for a full-page SPA redirect. */
export function buildAuthorizeUrl(opts: { state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authority()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const url = `${authority()}/oauth2/v2.0/token`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (e) {
    throw new TransientAuthError(`Couldn't reach the sign-in service (${String(e instanceof Error ? e.message : e)}).`);
  }
  const text = await res.text().catch(() => "");
  let json: { error?: string; error_description?: string } & Partial<TokenResponse> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) throw new TokenError(res.status, json.error ?? "unknown", (json.error_description ?? "").split("\n")[0]);
  return json as TokenResponse;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  return postToken({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    scope: GRAPH_SCOPES,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES,
  });
}
