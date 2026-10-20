// Thin typed wrappers over the native (Rust) sync commands. Keeping them in one
// place means the rest of the sync layer never touches `invoke` directly, and the
// browser/test path can see exactly what's unavailable off-desktop.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

// ── Large media (native chunked transfer) ─────────────────────────────────────────
// A media file past LARGE_MEDIA_THRESHOLD never crosses the invoke boundary as bytes
// — these commands take/return only small control values (a vault-relative path, a
// url, an offset, a size) and do the actual byte-shuffling on the Rust side, reading
// or writing the local file directly. See src-tauri/src/media_transfer.rs.

/** Byte size of a vault-relative media file, or null if it's absent. A plain fs stat
 *  — never reads the file's contents. */
export async function mediaSize(rel: string): Promise<number | null> {
  requireTauri("Media size check");
  return invoke<number | null>("media_size", { rel });
}

/** Stream a local media file to an already-created Graph upload session, resuming
 *  from `resumeFrom` (bytes Graph has already acknowledged — see adapter.ts
 *  queryUploadSession). Returns the final DriveItem id once the last chunk lands. */
export async function uploadMediaChunked(rel: string, uploadUrl: string, resumeFrom: number): Promise<string> {
  requireTauri("Large media upload");
  return invoke<string>("upload_media_chunked", { rel, uploadUrl, resumeFrom });
}

/** Stream a media binary from an authenticated Graph content URL straight to disk via
 *  chunked Range GETs, resuming from whatever a previous partial attempt left on disk.
 *  Returns the total bytes written once the file is confirmed complete. */
export async function downloadMediaChunked(
  rel: string,
  url: string,
  token: string,
  expectedSize: number,
): Promise<number> {
  requireTauri("Large media download");
  return invoke<number>("download_media_chunked", { rel, url, token, expectedSize });
}

export interface MediaTransferProgress {
  ref: string;
  sent: number;
  total: number;
}

/** Subscribe to progress ticks from an in-flight native chunked transfer. Returns an
 *  unsubscribe function; a no-op off native (there's nothing to listen to). */
export function onMediaTransferProgress(
  kind: "upload" | "download",
  cb: (p: MediaTransferProgress) => void,
): () => void {
  if (!isTauri()) return () => {};
  const event = kind === "upload" ? "media-upload-progress" : "media-download-progress";
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void listen<MediaTransferProgress>(event, (e) => cb(e.payload)).then((u) => {
    if (cancelled) u();
    else unlisten = u;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
