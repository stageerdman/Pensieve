// Ref ↔ URL rewrite. The .md stores vault-relative refs (`media/<noteId>/<mediaId>.<ext>`);
// a webview can't load those directly, so at load we rewrite each ref to a loadable URL
// (a Tauri asset URL on the native app, a blob/object URL in the browser) and on save we
// rewrite back to the canonical ref.
//
// The forward direction is backend-specific and async (it reads the file / mints a blob
// URL), so it delegates to the active Store's loadMediaUrl. The inverse must be exact and
// synchronous — but neither an asset URL nor an (opaque) blob URL can be reversed to a ref
// by string surgery alone. So we keep a tiny bidirectional registry: every URL we hand out
// is recorded against its ref, and the inverse is a lookup. Lossless by construction, and
// backend-agnostic.

import { getStore } from "../store";
import { log } from "../logger";

const refToUrl = new Map<string, string>();
const urlToRef = new Map<string, string>();

/** Record a ref↔URL pairing (used internally by resolveMediaUrl; exposed for adapters/tests). */
export function registerMediaUrl(ref: string, url: string): void {
  refToUrl.set(ref, url);
  urlToRef.set(url, ref);
}

/** The vault-relative ref a loadable URL was resolved from, or null if unknown. */
export function refForUrl(url: string): string | null {
  return urlToRef.get(url) ?? null;
}

/** A previously-resolved loadable URL for a ref, if one is cached. */
export function urlForRef(ref: string): string | null {
  return refToUrl.get(ref) ?? null;
}

/** Resolve a vault-relative media ref to a loadable URL via the active store, recording
 *  the pairing so refForUrl() can rewrite it back on save. null if the file is missing. */
export async function resolveMediaUrl(ref: string): Promise<string | null> {
  try {
    const url = await getStore().loadMediaUrl(ref);
    if (url) registerMediaUrl(ref, url);
    return url;
  } catch (e) {
    log.error("media", "resolve.error", { ref, error: String(e) });
    return null;
  }
}

/** Test helper — clear the registry. */
export function _resetMediaUrlRegistry(): void {
  refToUrl.clear();
  urlToRef.clear();
}
