// Token provider: the access-token refresh path. These tests lock the behaviour
// that fixes the "sign-in expired on every sync" bug — honest error classification
// (only a genuinely revoked token means reconnect) and single-flight refresh (so
// concurrent callers never double-redeem and invalidate a rotating refresh token).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshAccessToken = vi.fn();
let stored: string | null = "rt-initial";
const secretSet = vi.fn(async (_key: string, v: string) => {
  stored = v;
});
const secretGet = vi.fn(async () => stored);

vi.mock("./oauth", () => ({ refreshAccessToken: (...a: unknown[]) => refreshAccessToken(...a) }));
vi.mock("./native", () => ({
  secretGet: (...a: unknown[]) => secretGet(...(a as [string])),
  secretSet: (...a: unknown[]) => secretSet(...(a as [string, string])),
}));
vi.mock("./config", () => ({
  getAzureConfig: async () => ({ clientId: "c", clientSecret: "", redirectUri: "", tenant: "consumers" }),
  KEY_REFRESH_TOKEN: "refresh-token",
}));

import { getAccessToken, clearTokenCache } from "./tokens";
import { ReconnectNeededError, TokenError, TransientSyncError } from "./types";

const ok = (token = "at-1", refresh: string | undefined = "rt-rotated") => ({
  access_token: token,
  refresh_token: refresh,
  expires_in: 3600,
  token_type: "Bearer",
  scope: "",
});

beforeEach(() => {
  clearTokenCache();
  stored = "rt-initial";
  refreshAccessToken.mockReset();
  secretSet.mockClear();
  secretGet.mockClear();
});
afterEach(() => clearTokenCache());

describe("getAccessToken", () => {
  it("returns the access token and persists the rotated refresh token", async () => {
    refreshAccessToken.mockResolvedValueOnce(ok("at-1", "rt-2"));
    expect(await getAccessToken()).toBe("at-1");
    expect(secretSet).toHaveBeenCalledWith("refresh-token", "rt-2");
  });

  it("caches — a second call within validity does not refresh again", async () => {
    refreshAccessToken.mockResolvedValueOnce(ok("at-1"));
    await getAccessToken();
    await getAccessToken();
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cold calls into ONE refresh (no double-redeem)", async () => {
    let resolve!: (v: unknown) => void;
    refreshAccessToken.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const a = getAccessToken();
    const b = getAccessToken();
    resolve(ok("at-1"));
    expect(await a).toBe("at-1");
    expect(await b).toBe("at-1");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("no stored token → ReconnectNeeded", async () => {
    stored = null;
    await expect(getAccessToken()).rejects.toBeInstanceOf(ReconnectNeededError);
  });

  it("invalid_grant → ReconnectNeeded (the ONLY real 'sign-in expired')", async () => {
    refreshAccessToken.mockRejectedValueOnce(new TokenError(400, "invalid_grant", "token revoked"));
    await expect(getAccessToken()).rejects.toBeInstanceOf(ReconnectNeededError);
  });

  it("token-endpoint 5xx → Transient (not expired)", async () => {
    refreshAccessToken.mockRejectedValueOnce(new TokenError(503, "temporarily_unavailable", ""));
    await expect(getAccessToken()).rejects.toBeInstanceOf(TransientSyncError);
  });

  it("network/transport error → Transient (not expired)", async () => {
    refreshAccessToken.mockRejectedValueOnce(new TransientSyncError("offline"));
    await expect(getAccessToken()).rejects.toBeInstanceOf(TransientSyncError);
  });

  it("a real config error (invalid_client) surfaces as itself, not a fake expiry", async () => {
    refreshAccessToken.mockRejectedValueOnce(new TokenError(401, "invalid_client", "bad client"));
    await expect(getAccessToken()).rejects.toMatchObject({ name: "TokenError", code: "invalid_client" });
  });

  it("a keychain-write hiccup does NOT discard the valid access token", async () => {
    refreshAccessToken.mockResolvedValueOnce(ok("at-1", "rt-2"));
    secretSet.mockRejectedValueOnce(new Error("keychain locked"));
    expect(await getAccessToken()).toBe("at-1");
  });
});
