// OAuth plumbing: PKCE generation, authorize-URL construction, and the token
// endpoint (code exchange + refresh). Locks the desktop/browser transport split
// (native httpRequest vs fetch) and the error classification — only a real
// TokenError means "reconnect"; a transport throw is always TransientSyncError.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tauriOn = false;
const httpRequest = vi.fn();
vi.mock("../store", () => ({ isTauri: () => tauriOn }));
vi.mock("./native", () => ({ httpRequest: (...a: unknown[]) => httpRequest(...a) }));

import { buildAuthorizeUrl, createPkce, exchangeCode, randomState, refreshAccessToken } from "./oauth";
import { authorityFor, GRAPH_SCOPES } from "./config";
import { TransientSyncError } from "./types";
import type { AzureConfig } from "./types";

const cfg: AzureConfig = {
  clientId: "client-1",
  clientSecret: "",
  redirectUri: "http://localhost:8711/callback",
  tenant: "consumers",
};

function okResponse(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  tauriOn = false;
  httpRequest.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createPkce", () => {
  it("produces a verifier + its SHA-256 base64url challenge", async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    // No base64 padding should leak through.
    expect(verifier).not.toContain("=");
    expect(challenge).not.toContain("=");

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    let bin = "";
    for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
    const expected = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("is random across calls", async () => {
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("randomState", () => {
  it("returns an unpadded base64url string", () => {
    const s = randomState();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is random across calls", () => {
    expect(randomState()).not.toBe(randomState());
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds the consent URL with PKCE + state + forced account chooser", () => {
    const url = buildAuthorizeUrl(cfg, { state: "st-1", challenge: "ch-1" });
    expect(url.startsWith(`${authorityFor(cfg.tenant)}/oauth2/v2.0/authorize?`)).toBe(true);

    const params = new URL(url).searchParams;
    expect(params.get("client_id")).toBe("client-1");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(params.get("response_mode")).toBe("query");
    expect(params.get("scope")).toBe(GRAPH_SCOPES);
    expect(params.get("state")).toBe("st-1");
    expect(params.get("code_challenge")).toBe("ch-1");
    expect(params.get("code_challenge_method")).toBe("S256");
    // Always force the account chooser so the owner can't accidentally reconnect
    // the wrong Microsoft account.
    expect(params.get("prompt")).toBe("select_account");
  });

  it("uses the tenant-specific authority", () => {
    const url = buildAuthorizeUrl({ ...cfg, tenant: "organizations" }, { state: "s", challenge: "c" });
    expect(url).toContain("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
  });
});

describe("exchangeCode (browser/fetch transport)", () => {
  it("POSTs the authorization_code grant with the PKCE verifier, no client_secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ access_token: "at", expires_in: 3600, token_type: "Bearer", scope: "s" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await exchangeCode(cfg, "code-1", "verifier-1");
    expect(res.access_token).toBe("at");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${authorityFor(cfg.tenant)}/oauth2/v2.0/token`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });

    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(body.get("client_id")).toBe(cfg.clientId);
    expect(body.get("scope")).toBe(GRAPH_SCOPES);
    expect(body.has("client_secret")).toBe(false);
  });

  it("includes client_secret when the app registration is confidential", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ access_token: "at", expires_in: 1, token_type: "Bearer", scope: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await exchangeCode({ ...cfg, clientSecret: "shh" }, "code-1", "verifier-1");
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get("client_secret")).toBe("shh");
  });

  it("maps a non-2xx response to TokenError, keeping only the first line of the description", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ error: "invalid_grant", error_description: "AADSTS700082: expired\r\nTrace: xyz" }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode(cfg, "bad", "v")).rejects.toMatchObject({
      name: "TokenError",
      status: 400,
      code: "invalid_grant",
      description: "AADSTS700082: expired",
    });
  });

  it("falls back to a generic error code when the error body isn't JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, text: async () => "<html>down</html>" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode(cfg, "bad", "v")).rejects.toMatchObject({ name: "TokenError", status: 500, code: "unknown" });
  });

  it("wraps a fetch throw (no network/DNS/timeout) as TransientSyncError, not an expired login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(exchangeCode(cfg, "code", "v")).rejects.toBeInstanceOf(TransientSyncError);
  });
});

describe("refreshAccessToken (browser/fetch transport)", () => {
  it("POSTs the refresh_token grant (no code/verifier)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse({ access_token: "at2", refresh_token: "rt2", expires_in: 3600, token_type: "Bearer", scope: "" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await refreshAccessToken(cfg, "rt-1");
    expect(res.access_token).toBe("at2");
    expect(res.refresh_token).toBe("rt2");

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-1");
    expect(body.has("code")).toBe(false);
    expect(body.has("code_verifier")).toBe(false);
  });

  it("invalid_grant surfaces as a TokenError callers can classify as ReconnectNeeded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ error: "invalid_grant", error_description: "revoked" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    await expect(refreshAccessToken(cfg, "rt-dead")).rejects.toMatchObject({ name: "TokenError", code: "invalid_grant" });
  });
});

describe("token endpoint (Tauri/native transport)", () => {
  it("routes through httpRequest instead of fetch, so no Origin header hits AADSTS90023", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: "nat", expires_in: 1, token_type: "Bearer", scope: "" }),
      headers: {},
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await exchangeCode(cfg, "c", "v");
    expect(res.access_token).toBe("nat");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequest).toHaveBeenCalledTimes(1);

    const req = httpRequest.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${authorityFor(cfg.tenant)}/oauth2/v2.0/token`);
    expect(req.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("maps a native non-2xx status to TokenError same as the fetch path", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({ status: 400, body: JSON.stringify({ error: "invalid_client" }), headers: {} });
    await expect(refreshAccessToken(cfg, "rt")).rejects.toMatchObject({ name: "TokenError", status: 400, code: "invalid_client" });
  });

  it("wraps a native transport throw as TransientSyncError", async () => {
    tauriOn = true;
    httpRequest.mockRejectedValue(new Error("timeout"));
    await expect(refreshAccessToken(cfg, "rt")).rejects.toBeInstanceOf(TransientSyncError);
  });
});
