// vaultStore.ts — the phone's note vault: id minting + localStorage persistence.
//
// Extracted from PhoneApp.tsx so lib/sync/vault.ts (the real OneDrive LocalVault)
// can read/write the SAME storage the Wand UI renders from, instead of a second,
// divergent copy. Notes are small text, so localStorage is fine (media bytes are
// the large payload and already live in IndexedDB — see lib/media/mediaStore.ts).
//
// `newId()` mirrors the desktop browser store's scheme (src/lib/store/browser.ts)
// — a base36 time prefix + random suffix — so a note minted on the phone is a
// globally-unique id compatible with the desktop vault's `.md` basename.

import type { Note } from "./types";
import { createSeed } from "./seed";

export function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const VAULT_KEY = "pensieve.phone.vault";

export function loadVault(): Note[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return createSeed();
    const v = JSON.parse(raw);
    // An empty array is a valid (if boring) vault — e.g. every note deleted, or a
    // fresh device before the first sync — and must NOT fall back to the seed demo.
    if (Array.isArray(v) && v.every((n) => n && typeof n.id === "string")) return v as Note[];
  } catch {
    /* corrupt / absent — fall back to seed */
  }
  return createSeed();
}

export function persistVault(data: Note[]): void {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  } catch {
    /* quota / unavailable — a reload just falls back to seed, no crash */
  }
}

/** Wipe the vault (and the recent-searches sidecar) back to nothing — used once to
 *  clear the demo seed before real OneDrive data loads. Does NOT touch media bytes
 *  (IndexedDB) or the OneDrive connection/sync state. */
export function clearVault(): void {
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    /* unavailable — nothing to clear */
  }
}
