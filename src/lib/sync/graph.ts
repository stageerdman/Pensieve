// Authenticated Graph client. Mirrors onedrive-manager's graphFetch: retries
// transient 429/503 honouring Retry-After, and refreshes the token once on a 401.
// The token comes from an injected provider so the portable adapter/engine can be
// driven by the real keychain path, a Node integration token, or a test fake.

import { GRAPH_BASE } from "./config";
import { isTauri } from "../store";
import { httpRequest } from "./native";
import { bytesToBase64, base64ToBytes } from "../media/base64";
import { TransientSyncError } from "./types";
import { log } from "../logger";

// On desktop, route through the native HTTP command (no webview Origin header, so
// Graph/token calls aren't subject to browser CORS). Off-desktop (tests, future
// PWA) use the platform fetch. Both return a standard Response the client wraps.
//
// Binary (media backup): a Uint8Array/ArrayBuffer body flagged `binaryBody` rides as
// base64 across the native bridge; a `binaryResponse` request decodes the response from
// base64 back to bytes so arbitrary image content survives. The browser path handles
// bytes natively, so the flags are no-ops there.
async function transport(url: string, options: GraphFetchOptions, token: string): Promise<Response> {
  const headers = { ...(options.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
  if (isTauri()) {
    const method = (options.method ?? "GET").toUpperCase();
    let body: string | null = null;
    let bodyBase64: string | null = null;
    if (options.body != null) {
      if (options.binaryBody && (options.body instanceof Uint8Array || options.body instanceof ArrayBuffer)) {
        bodyBase64 = bytesToBase64(options.body as Uint8Array | ArrayBuffer);
      } else {
        body = typeof options.body === "string" ? options.body : String(options.body);
      }
    }
    const r = await httpRequest({ method, url, headers, body, bodyBase64, responseBase64: !!options.binaryResponse });
    if (options.binaryResponse) {
      const bytes = r.bodyBase64 ? base64ToBytes(r.bodyBase64) : null;
      // A null-body status (204/304/404) must not carry a body, or the Response ctor throws.
      const respBody = (bytes && bytes.length ? bytes : null) as unknown as BodyInit | null;
      return new Response(respBody, { status: r.status, headers: r.headers });
    }
    return new Response(r.body.length ? r.body : null, { status: r.status, headers: r.headers });
  }
  return fetch(url, { ...options, headers });
}

export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop any cached access token so the next getToken() forces a refresh. */
  invalidate?(): void;
}

export interface GraphFetchOptions extends RequestInit {
  /** Absolute Graph URL (e.g. an @odata.nextLink/deltaLink) bypasses GRAPH_BASE. */
  absolute?: boolean;
  /** The body is binary bytes (Uint8Array/ArrayBuffer) — base64 it over the native bridge. */
  binaryBody?: boolean;
  /** Expect a binary response — decode it from base64 to bytes (image downloads). */
  binaryResponse?: boolean;
}

export interface GraphClient {
  fetch(path: string, options?: GraphFetchOptions): Promise<Response>;
  json<T>(path: string, options?: GraphFetchOptions): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeGraphClient(provider: TokenProvider): GraphClient {
  const maxRetries = 4;

  async function doFetch(path: string, options: GraphFetchOptions = {}): Promise<Response> {
    const url = options.absolute ? path : `${GRAPH_BASE}${path}`;
    for (let attempt = 0; ; attempt++) {
      const token = await provider.getToken();
      let res: Response;
      try {
        res = await transport(url, options, token);
      } catch (e) {
        // A transport throw (no network, DNS, native HTTP timeout) is temporary —
        // one retry, then surface it as transient (not a generic/expired error).
        if (attempt < maxRetries) {
          await sleep(Math.min(2 ** attempt, 30) * 1000);
          continue;
        }
        throw new TransientSyncError(`Couldn't reach OneDrive (${String(e instanceof Error ? e.message : e)}).`);
      }

      if (res.status === 401 && attempt === 0) {
        provider.invalidate?.();
        continue;
      }
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        log.debug("sync", "graph.retry", { status: res.status, attempt, retryAfter });
        await sleep(Math.min(retryAfter, 30) * 1000);
        continue;
      }
      return res;
    }
  }

  async function json<T>(path: string, options?: GraphFetchOptions): Promise<T> {
    const res = await doFetch(path, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // A 5xx (or a 429 that outlived its retries) is OneDrive being temporarily
      // unavailable — transient, not a bug on our side and not an expired login.
      if (res.status >= 500 || res.status === 429) {
        throw new TransientSyncError(`OneDrive is temporarily unavailable (${res.status}).`);
      }
      throw new Error(`Graph ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  return { fetch: doFetch, json };
}
