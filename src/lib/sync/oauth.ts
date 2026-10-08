// Microsoft identity OAuth — authorization-code flow with PKCE. Mirrors the
// proven spike/onedrive-manager path: for the confidential "Web" desktop app the
// client secret is sent alongside PKCE; for a public client it's simply omitted.
// Runs in the webview, so PKCE uses Web Crypto (not node:crypto).

import type { AzureConfig, TokenResponse } from "./types";
import { TokenError, TransientSyncError } from "./types";
import { authorityFor, GRAPH_SCOPES } from "./config";
import { isTauri } from "../store";
import { httpRequest } from "./native";

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

/** Build the Microsoft consent URL for the desktop (loopback-redirect) flow. */
export function buildAuthorizeUrl(cfg: AzureConfig, opts: { state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    // Always show the account chooser so the owner picks the right OneDrive.
    prompt: "select_account",
  });
  return `${authorityFor(cfg.tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function postToken(cfg: AzureConfig, body: Record<string, string>): Promise<TokenResponse> {
  const withSecret = cfg.clientSecret ? { ...body, client_secret: cfg.clientSecret } : body;
  const url = `${authorityFor(cfg.tenant)}/oauth2/v2.0/token`;
  const encoded = new URLSearchParams(withSecret).toString();
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  // Desktop: go through native HTTP so there's no Origin header (a webview fetch
  // trips Microsoft's CORS on the token endpoint — AADSTS90023). Off-desktop: fetch.
  // A thrown transport error (no network, DNS, timeout) is transient, not an
  // expired login — surface it as such rather than "reconnect".
  let status: number;
  let text: string;
  try {
    if (isTauri()) {
      const r = await httpRequest({ method: "POST", url, headers, body: encoded });
      status = r.status;
      text = r.body;
    } else {
      const res = await fetch(url, { method: "POST", headers, body: encoded });
      status = res.status;
      text = await res.text();
    }
  } catch (e) {
    throw new TransientSyncError(`Couldn't reach the sign-in service (${String(e instanceof Error ? e.message : e)}).`);
  }

  let json: { error?: string; error_description?: string } & Partial<TokenResponse> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (status < 200 || status >= 300) {
    throw new TokenError(status, json.error ?? "unknown", (json.error_description ?? "").split("\n")[0]);
  }
  return json as TokenResponse;
}

export function exchangeCode(cfg: AzureConfig, code: string, verifier: string): Promise<TokenResponse> {
  return postToken(cfg, {
    client_id: cfg.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
    scope: GRAPH_SCOPES,
  });
}

export function refreshAccessToken(cfg: AzureConfig, refreshToken: string): Promise<TokenResponse> {
  return postToken(cfg, {
    client_id: cfg.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES,
  });
}
