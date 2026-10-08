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
  headers: Record<string, string>; // names lowercased
}

/** Make an HTTP request from the native side (no webview Origin header). Used for
 *  the OAuth token endpoint and all Graph calls on desktop — a browser fetch would
 *  attach an Origin that trips Microsoft's CORS rules (AADSTS90023). */
export async function httpRequest(req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}): Promise<HttpRes> {
  requireTauri("HTTP");
  return invoke<HttpRes>("http_request", {
    req: { method: req.method, url: req.url, headers: req.headers ?? {}, body: req.body ?? null },
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
