// vault.ts — the phone's LocalVault: the same shape as the desktop sync engine
// expects (src/lib/sync/vault.ts's LocalVault interface), backed by the Wand's own
// storage (vaultStore.ts for notes, lib/media/mediaStore.ts for media bytes)
// instead of the native filesystem. Re-implemented rather than imported — see
// lib/sync/noteFormat.ts's header for why.
//
// engine.ts (ported in Phase 3) is injected with this vault + a GraphClient and
// knows nothing about where the bytes actually live.

import { loadVault, persistVault } from "../../vaultStore";
import { getMediaBytes, listMediaKeys, putMedia } from "../media/mediaStore";
import { mediaContentType } from "./adapter";
import { noteFromRemoteContent, noteToRemoteContent } from "./noteFormat";
import { EMPTY_SYNC_STATE, type SyncState } from "./types";

export interface LocalNoteInfo {
  id: string;
  updatedAt: number;
}

export interface WriteTimes {
  createdAt?: number;
  updatedAt?: number;
}

export interface LocalVault {
  listNotes(): Promise<LocalNoteInfo[]>;
  readNote(id: string): Promise<string | null>;
  writeNote(id: string, content: string, times?: WriteTimes): Promise<void>;
  deleteNote(id: string): Promise<void>;
  readState(): Promise<SyncState>;
  writeState(state: SyncState): Promise<void>;
  listMedia(): Promise<string[]>;
  readMediaBytes(ref: string): Promise<Uint8Array | null>;
  writeMediaBytes(ref: string, bytes: Uint8Array): Promise<void>;
  mediaSize(ref: string): Promise<number | null>;
}

const STATE_KEY = "pensieve.phone.syncState";

export function phoneVault(): LocalVault {
  return {
    async listNotes() {
      return loadVault().map((n) => ({ id: n.id, updatedAt: n.updatedAt }));
    },

    async readNote(id) {
      const note = loadVault().find((n) => n.id === id);
      return note ? noteToRemoteContent(note) : null;
    },

    async writeNote(id, content, times) {
      const data = loadVault();
      const i = data.findIndex((n) => n.id === id);
      const existing = i >= 0 ? data[i] : undefined;
      const note = noteFromRemoteContent(id, content, times ?? {}, existing);
      if (i >= 0) data[i] = note;
      else data.unshift(note);
      persistVault(data);
    },

    async deleteNote(id) {
      persistVault(loadVault().filter((n) => n.id !== id));
    },

    async readState() {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return { ...EMPTY_SYNC_STATE, notes: {} };
        return JSON.parse(raw) as SyncState;
      } catch {
        return { ...EMPTY_SYNC_STATE, notes: {} };
      }
    },

    async writeState(state) {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
      } catch {
        /* quota / unavailable — next sync just re-derives what it can */
      }
    },

    listMedia: () => listMediaKeys(),
    readMediaBytes: (ref) => getMediaBytes(ref),
    // Uint8Array is a valid BlobPart at runtime; the cast sidesteps the
    // ArrayBufferLike/SharedArrayBuffer generic noise (mirrors src/lib/store/browser.ts).
    // The blob MUST carry a real MIME type (not the default "") — Safari's <audio> element
    // relies on it to pick a decoder; an untyped blob: URL silently fails to play some audio
    // containers (m4a) while others happen to still decode by content-sniffing, which is
    // exactly the "plays in one recording but not others" bug this fixes.
    writeMediaBytes: (ref, bytes) => putMedia(ref, new Blob([bytes as BlobPart], { type: mediaContentType(ref) })),
    async mediaSize(ref) {
      const bytes = await getMediaBytes(ref);
      return bytes ? bytes.byteLength : null;
    },
  };
}
