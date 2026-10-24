// graph.ts — the authenticated Graph client, browser-only.
//
// Simpler than the desktop's (src/lib/sync/graph.ts): no native-transport detour is
// needed for binary bodies/responses — a plain `fetch` handles Uint8Array bodies and
// `.arrayBuffer()` responses natively. Retries 429/503 honouring Retry-After, and
// refreshes the token once on a 401 — same discipline as desktop/onedrive-manager.

import { GRAPH_BASE } from "./config";
import { TransientSyncError } from "./errors";

export interface TokenProvider {
  getToken(): Promise<string>;
  invalidate?(): void;
}

export interface GraphFetchOptions extends RequestInit {
  /** Absolute Graph URL (e.g. an @odata.nextLink/deltaLink) bypasses GRAPH_BASE. */
  absolute?: boolean;
  /** Skip attaching our Bearer token — required for a resumable upload-session URL,
   *  which is pre-authorized and rejects a request that carries one. */
  skipAuth?: boolean;
}

export interface GraphClient {
  fetch(path: string, options?: GraphFetchOptions): Promise<Response>;
  json<T>(path: string, options?: GraphFetchOptions): Promise<T>;
  token(): Promise<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeGraphClient(provider: TokenProvider): GraphClient {
  const maxRetries = 4;

  async function doFetch(path: string, options: GraphFetchOptions = {}): Promise<Response> {
    const url = options.absolute ? path : `${GRAPH_BASE}${path}`;
    for (let attempt = 0; ; attempt++) {
      const headers = { ...(options.headers as Record<string, string> | undefined) };
      if (!options.skipAuth) headers.Authorization = `Bearer ${await provider.getToken()}`;

      let res: Response;
      try {
        res = await fetch(url, { ...options, headers });
      } catch (e) {
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
      if (res.status >= 500 || res.status === 429) {
        throw new TransientSyncError(`OneDrive is temporarily unavailable (${res.status}).`);
      }
      throw new Error(`Graph ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  return { fetch: doFetch, json, token: () => provider.getToken() };
}
