// tokens.ts — refresh-token storage + the access-token provider.
//
// localStorage, not IndexedDB: the refresh token is one short string, and every
// other piece of phone state (the vault, sync bookkeeping) already lives there —
// keeping storage uniform beats a marginal, unproven hardening gain for a
// single-user app with no third-party scripts on the page.

import { ReconnectNeededError, TransientSyncError } from "./errors";
import { refreshAccessToken, TokenError, TransientAuthError } from "./oauth";

const REFRESH_TOKEN_KEY = "pensieve.phone.refreshToken";

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    /* quota / unavailable — the connect flow will just have to run again */
  }
}

export function clearStoredRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* no-op */
  }
}

export function isConnected(): boolean {
  return !!getStoredRefreshToken();
}

// ---- access token cache + single-flight refresh (mirrors src/lib/sync/tokens.ts:
// Microsoft rotates refresh tokens on use, so two concurrent callers redeeming the
// SAME one would have the second redemption fail — coalesce onto one refresh). ----

interface Cached {
  token: string;
  expiresAt: number;
}

let cache: Cached | null = null;
let inflight: Promise<string> | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.token;
  if (inflight) return inflight;
  inflight = doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<string> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) throw new ReconnectNeededError();

  let res;
  try {
    res = await refreshAccessToken(refreshToken);
  } catch (e) {
    cache = null;
    if (e instanceof TokenError && e.code === "invalid_grant") {
      throw new ReconnectNeededError("Your OneDrive sign-in has expired.");
    }
    if (e instanceof TransientAuthError || (e instanceof TokenError && e.status >= 500)) {
      throw new TransientSyncError();
    }
    throw e;
  }

  cache = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  if (res.refresh_token) setStoredRefreshToken(res.refresh_token);
  return res.access_token;
}

export function clearTokenCache(): void {
  cache = null;
}
