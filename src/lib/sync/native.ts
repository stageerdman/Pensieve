// Thin typed wrappers over the native (Rust) sync commands. Keeping them in one
// place means the rest of the sync layer never touches `invoke` directly, and the
// browser/test path can see exactly what's unavailable off-desktop.

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../store";

function requireTauri(what: string): void {
  if (!isTauri()) {
    throw new Error(`${what} is only available in the native app.`);
  }
}

/** Read a secret from the native secret store (null if absent). */
export async function secretGet(key: string): Promise<string | null> {
  requireTauri("Secret store access");
  return invoke<string | null>("secret_get", { key });
}

export async function secretSet(key: string, value: string): Promise<void> {
  requireTauri("Secret store access");
  await invoke<void>("secret_set", { key, value });
}

export async function secretDelete(key: string): Promise<void> {
  requireTauri("Secret store access");
  await invoke<void>("secret_delete", { key });
}

/** Open a URL in the system browser (the OAuth consent screen). */
export async function openUrl(url: string): Promise<void> {
  requireTauri("Opening a browser");
  await invoke<void>("open_url", { url });
}

/** True if the loopback port the OAuth redirect needs is free to bind. */
export async function portAvailable(port: number): Promise<boolean> {
  requireTauri("Port check");
  return invoke<boolean>("port_available", { port });
}

export interface HttpRes {
  status: number;
  body: string;
  /** Present only when `responseBase64` was requested — the raw response bytes, base64'd. */
  bodyBase64?: string | null;
  headers: Record<string, string>; // names lowercased
}

/** Make an HTTP request from the native side (no webview Origin header). Used for
 *  the OAuth token endpoint and all Graph calls on desktop — a browser fetch would
 *  attach an Origin that trips Microsoft's CORS rules (AADSTS90023).
 *
 *  Binary: pass `bodyBase64` to send image bytes (a JS string can't carry them), and
 *  `responseBase64: true` to get a binary response back base64-encoded in `bodyBase64`.
 *  The plain `body` string path is unchanged for notes / JSON / the token form. */
export async function httpRequest(req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  bodyBase64?: string | null;
  responseBase64?: boolean;
}): Promise<HttpRes> {
  requireTauri("HTTP");
  return invoke<HttpRes>("http_request", {
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers ?? {},
      body: req.body ?? null,
      bodyBase64: req.bodyBase64 ?? null,
      responseBase64: req.responseBase64 ?? false,
    },
  });
}

export interface AuthCode {
  code: string | null;
  state: string | null;
  error: string | null;
}

/** Start the one-shot loopback server and wait for the OAuth redirect. Fire this
 *  WITHOUT awaiting, then open the browser, then await the returned promise. */
export function oauthListen(port: number, path: string, timeoutSecs: number): Promise<AuthCode> {
  requireTauri("OAuth loopback");
  return invoke<AuthCode>("oauth_listen", { port, path, timeoutSecs });
}
