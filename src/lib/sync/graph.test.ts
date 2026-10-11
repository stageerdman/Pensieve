// Authenticated Graph client: the shared retry/refresh/throttle wrapper every
// Graph call goes through. Locks the single-retry-on-401 token refresh, the
// 429/503 Retry-After backoff (falling back to exponential when absent), the
// transient-vs-real-error classification on json(), and the native/browser
// transport split (incl. the null-body Response guard for 204/304).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tauriOn = false;
const httpRequest = vi.fn();
vi.mock("../store", () => ({ isTauri: () => tauriOn }));
vi.mock("./native", () => ({ httpRequest: (...a: unknown[]) => httpRequest(...a) }));

import { makeGraphClient } from "./graph";
import type { TokenProvider } from "./graph";
import { TransientSyncError } from "./types";

function resp(status: number, body: unknown = "", headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

function provider(token = "tok-1") {
  return { getToken: vi.fn().mockResolvedValue(token), invalidate: vi.fn() } satisfies TokenProvider;
}

beforeEach(() => {
  tauriOn = false;
  httpRequest.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetch() — URL building + auth header", () => {
  it("prefixes a relative path with GRAPH_BASE and attaches the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider("tok-xyz"));

    await client.fetch("/me/drive/root");
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.microsoft.com/v1.0/me/drive/root");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer tok-xyz");
  });

  it("uses the path verbatim when absolute (an @odata.nextLink/deltaLink)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    await client.fetch("https://graph.microsoft.com/v1.0/next?x=1", { absolute: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.microsoft.com/v1.0/next?x=1");
  });
});

describe("fetch() — 401 refresh-once", () => {
  it("invalidates the cached token and retries once on 401, then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const p = provider();
    const client = makeGraphClient(p);

    const res = await client.fetch("/me");
    expect(res.status).toBe(200);
    expect(p.invalidate).toHaveBeenCalledTimes(1);
    expect(p.getToken).toHaveBeenCalledTimes(2);
  });

  it("does not retry a SECOND consecutive 401 — returns it as-is", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(401));
    vi.stubGlobal("fetch", fetchMock);
    const p = provider();
    const client = makeGraphClient(p);

    const res = await client.fetch("/me");
    expect(res.status).toBe(401);
    expect(p.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetch() — 429/503 throttling backoff", () => {
  it("honours the Retry-After header before retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(429, "", { "retry-after": "5" }))
      .mockResolvedValueOnce(resp(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.fetch("/me");
    await vi.advanceTimersByTimeAsync(5000);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to exponential backoff (2**attempt seconds) when Retry-After is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.fetch("/me");
    await vi.advanceTimersByTimeAsync(1000); // 2**0 = 1s
    const res = await pending;
    expect(res.status).toBe(200);
  });

  it("gives up after maxRetries on sustained 429s and returns the last response (not a throw)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(429, "", { "retry-after": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.fetch("/me");
    await vi.runAllTimersAsync();
    const res = await pending;
    expect(res.status).toBe(429);
    // attempts 0,1,2,3 retried (maxRetries=4), attempt 4 stops retrying → 5 calls total.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("fetch() — transport throw", () => {
  it("retries a transport error, then surfaces TransientSyncError after exhausting retries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.fetch("/me");
    const assertion = expect(pending).rejects.toBeInstanceOf(TransientSyncError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("succeeds if the transport recovers within maxRetries", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("DNS blip")).mockResolvedValueOnce(resp(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.fetch("/me");
    await vi.advanceTimersByTimeAsync(1000);
    const res = await pending;
    expect(res.status).toBe(200);
  });
});

describe("json()", () => {
  it("parses the body on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(200, { value: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());
    expect(await client.json("/x")).toEqual({ value: 1 });
  });

  it("maps a 5xx to TransientSyncError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(500, "oops"));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());
    await expect(client.json("/x")).rejects.toBeInstanceOf(TransientSyncError);
  });

  it("maps a 429 that outlived its retries to TransientSyncError, not a hard failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(429, "", { "retry-after": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());

    const pending = client.json("/x");
    const assertion = expect(pending).rejects.toBeInstanceOf(TransientSyncError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("maps a real client error (4xx other than 429) to a plain Error carrying path+status+body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(400, "bad request body"));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider());
    await expect(client.json("/x")).rejects.toThrow(/Graph \/x failed \(400\): bad request body/);
  });
});

describe("native transport (desktop)", () => {
  it("routes through httpRequest instead of fetch and attaches the bearer token", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({ status: 200, body: JSON.stringify({ ok: true }), headers: {} });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = makeGraphClient(provider("tok-n"));

    const res = await client.json("/me");
    expect(res).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpRequest).toHaveBeenCalledTimes(1);

    const call = httpRequest.mock.calls[0][0];
    expect(call.url).toBe("https://graph.microsoft.com/v1.0/me");
    expect(call.headers.Authorization).toBe("Bearer tok-n");
  });

  it("builds a bodyless Response for a 204 (empty body must not throw constructing Response)", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({ status: 204, body: "", headers: {} });
    const client = makeGraphClient(provider());

    const res = await client.fetch("/me/drive/items/x", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("stringifies a non-string request body before sending", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({ status: 200, body: "{}", headers: {} });
    const client = makeGraphClient(provider());

    await client.fetch("/me", { method: "PUT", body: { toString: () => "blob-data" } as unknown as BodyInit });
    expect(httpRequest.mock.calls[0][0].body).toBe("blob-data");
  });

  it("sends a null body through untouched", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValue({ status: 200, body: "{}", headers: {} });
    const client = makeGraphClient(provider());

    await client.fetch("/me", { method: "GET" });
    expect(httpRequest.mock.calls[0][0].body).toBe(null);
  });

  it("applies the same 401-invalidate-retry logic over the native transport", async () => {
    tauriOn = true;
    httpRequest.mockResolvedValueOnce({ status: 401, body: "", headers: {} }).mockResolvedValueOnce({ status: 200, body: "{}", headers: {} });
    const p = provider();
    const client = makeGraphClient(p);

    const res = await client.fetch("/me");
    expect(res.status).toBe(200);
    expect(p.invalidate).toHaveBeenCalledTimes(1);
  });
});
