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
//
// NO seed fallback here (PWA-CAPTURE v2) — the real vault starts genuinely empty
// until OneDrive sync or the owner's own writing fills it. `seed.ts` is now a test
// fixture only (PhoneApp.test.tsx seeds it explicitly). See main.tsx's
// ensureFreshStart for the one-time migration that clears demo data a device
// already persisted from an earlier, seed-backed build.

import type { Note } from "./types";

export function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const VAULT_KEY = "pensieve.phone.vault";

export function loadVault(): Note[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((n) => n && typeof n.id === "string")) return v as Note[];
  } catch {
    /* corrupt — treat as empty rather than crash */
  }
  return [];
}

export function persistVault(data: Note[]): void {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  } catch {
    /* quota / unavailable — a reload just starts from whatever was last saved */
  }
}

/** Wipe the vault back to nothing. Does NOT touch media bytes (IndexedDB) or the
 *  OneDrive connection/sync state. */
export function clearVault(): void {
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    /* unavailable — nothing to clear */
  }
}
