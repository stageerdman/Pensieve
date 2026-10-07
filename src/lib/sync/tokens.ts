// Access-token provider. Access tokens are short-lived and kept in memory only;
// the refresh token lives encrypted in the OS keychain. We refresh silently
// before expiry and surface ReconnectNeeded if the refresh token is rejected —
// the same discipline as onedrive-manager, with the keychain in place of SQLite.

import { ReconnectNeededError } from "./types";
import { getAzureConfig, KEY_REFRESH_TOKEN } from "./config";
import { refreshAccessToken } from "./oauth";
import { secretGet, secretSet } from "./native";
import { log } from "../logger";

interface Cached {
  token: string;
  expiresAt: number; // epoch ms
}

let cache: Cached | null = null;

/** True if a refresh token is stored (i.e. OneDrive is connected). */
export async function isConnected(): Promise<boolean> {
  try {
    return !!(await secretGet(KEY_REFRESH_TOKEN));
  } catch {
    return false;
  }
}

/** Get a valid access token, refreshing if needed. Throws ReconnectNeeded if the
 *  account isn't connected or the refresh token is no longer valid. */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.token;

  const refreshToken = await secretGet(KEY_REFRESH_TOKEN);
  if (!refreshToken) throw new ReconnectNeededError();

  const cfg = await getAzureConfig();
  try {
    const res = await refreshAccessToken(cfg, refreshToken);
    cache = { token: res.access_token, expiresAt: now + res.expires_in * 1000 };
    // Microsoft rotates refresh tokens — persist the new one so it never goes stale.
    if (res.refresh_token) await secretSet(KEY_REFRESH_TOKEN, res.refresh_token);
    log.debug("sync", "token.refresh", { expiresIn: res.expires_in });
    return res.access_token;
  } catch (e) {
    cache = null;
    log.warn("sync", "token.refresh.failed", { error: String(e) });
    throw new ReconnectNeededError("OneDrive sign-in expired — reconnect.");
  }
}

/** Drop the cached access token (after a 401, or on sign-out). */
export function clearTokenCache(): void {
  cache = null;
}
