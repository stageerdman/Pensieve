// Access-token provider. Access tokens are short-lived and kept in memory only;
// the refresh token lives encrypted in the OS keychain. We refresh silently
// before expiry and surface ReconnectNeeded if the refresh token is rejected —
// the same discipline as onedrive-manager, with the keychain in place of SQLite.

import { ReconnectNeededError, TokenError, TransientSyncError } from "./types";
import { getAzureConfig, KEY_REFRESH_TOKEN } from "./config";
import { refreshAccessToken } from "./oauth";
import { secretGet, secretSet } from "./native";
import { log } from "../logger";

interface Cached {
  token: string;
  expiresAt: number; // epoch ms
}

let cache: Cached | null = null;
// A single in-flight refresh shared by all concurrent callers. Without this, two
// Graph calls that both miss the cache would each redeem the SAME refresh token;
// Microsoft rotates (and invalidates) a refresh token on use, so the second
// redemption fails with invalid_grant — which previously surfaced as a bogus
// "sign-in expired" on an account that was perfectly valid.
let inflight: Promise<string> | null = null;

/** True if a refresh token is stored (i.e. OneDrive is connected). */
export async function isConnected(): Promise<boolean> {
  try {
    return !!(await secretGet(KEY_REFRESH_TOKEN));
  } catch {
    return false;
  }
}

/** Get a valid access token, refreshing if needed. Throws:
 *   - {@link ReconnectNeededError} only when there's no token, or the stored token
 *     was genuinely revoked/expired (`invalid_grant`) — the sole "sign in again" case;
 *   - {@link TransientSyncError} for a network error / token-endpoint 5xx (temporary);
 *   - a {@link TokenError} for a real config problem (e.g. invalid_client), so it's
 *     surfaced truthfully instead of as a fake expiry. */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.token;
  // Coalesce concurrent refreshes onto one redemption (see `inflight` above).
  if (inflight) return inflight;
  inflight = doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<string> {
  const refreshToken = await secretGet(KEY_REFRESH_TOKEN);
  if (!refreshToken) throw new ReconnectNeededError();

  const cfg = await getAzureConfig();
  let res;
  try {
    res = await refreshAccessToken(cfg, refreshToken);
  } catch (e) {
    cache = null;
    // Genuinely expired/revoked → reconnect. Everything else keeps the login intact.
    if (e instanceof TokenError && e.code === "invalid_grant") {
      log.warn("sync", "token.refresh.expired", { code: e.code, status: e.status });
      throw new ReconnectNeededError("Your OneDrive sign-in has expired.");
    }
    if (e instanceof TransientSyncError || (e instanceof TokenError && e.status >= 500)) {
      log.warn("sync", "token.refresh.transient", { error: String(e) });
      throw e instanceof TransientSyncError ? e : new TransientSyncError();
    }
    // A real token-endpoint error (bad client id/secret, unauthorized_client, …):
    // not an expiry — report it as-is so the actual problem is visible.
    log.error("sync", "token.refresh.failed", { error: String(e) });
    throw e;
  }

  cache = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  // Microsoft rotates refresh tokens — persist the new one BEFORE returning so a
  // crash can't leave us holding a token that's already been invalidated. A
  // keychain-write hiccup must NOT discard the valid access token we just got.
  if (res.refresh_token) {
    try {
      await secretSet(KEY_REFRESH_TOKEN, res.refresh_token);
    } catch (e) {
      log.error("sync", "token.persist.failed", { error: String(e) });
    }
  }
  log.debug("sync", "token.refresh", { expiresIn: res.expires_in, rotated: !!res.refresh_token });
  return res.access_token;
}

/** Drop the cached access token (after a 401, or on sign-out). */
export function clearTokenCache(): void {
  cache = null;
}
