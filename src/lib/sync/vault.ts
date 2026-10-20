// Local vault access for the sync engine. The engine works at the raw `.md` file
// level (the source of truth, frontmatter + body) rather than the Note model, so a
// pulled remote file lands on disk byte-for-byte. This interface is injectable so
// the engine is unit-testable with an in-memory vault.

import { invoke } from "@tauri-apps/api/core";
import type { SyncState } from "./types";
import { EMPTY_SYNC_STATE } from "./types";
import { parseFrontmatter } from "../md/frontmatter";
import { titleFromMarkdown } from "../text";
import { MEDIA_DIR, base64ToBytes, bytesToBase64 } from "../media";
import { downloadMediaChunked, mediaSize as nativeMediaSize, uploadMediaChunked } from "./native";

export interface LocalNoteInfo {
  id: string;
  updatedAt: number;
}

export interface WriteTimes {
  createdAt?: number;
  updatedAt?: number;
}

export interface LocalVault {
  /** Every note's id + its last local modification time (from the meta sidecar). */
  listNotes(): Promise<LocalNoteInfo[]>;
  /** Raw `.md` content (frontmatter + body), or null if absent. */
  readNote(id: string): Promise<string | null>;
  /** Write the raw `.md` and refresh the meta sidecar (title/timestamps/tags). */
  writeNote(id: string, content: string, times?: WriteTimes): Promise<void>;
  deleteNote(id: string): Promise<void>;
  readState(): Promise<SyncState>;
  writeState(state: SyncState): Promise<void>;
  /** Every media ref present on disk (`media/<noteId>/<file>`) — the backup push set. */
  listMedia(): Promise<string[]>;
  /** Raw bytes of a media file, or null if absent. */
  readMediaBytes(ref: string): Promise<Uint8Array | null>;
  /** Write raw bytes for a media ref (creates parent dirs) — pulled-media rehydration. */
  writeMediaBytes(ref: string, bytes: Uint8Array): Promise<void>;
  /** Byte size of a media file without reading its contents, or null if absent. Lets
   *  the sync engine route big media through the streaming path (below) instead of
   *  loading it whole into memory just to find out how big it is. */
  mediaSize(ref: string): Promise<number | null>;
  /** Stream a large media file straight from disk to an already-created Graph upload
   *  session, resuming from `resumeFrom`. Native-only — undefined elsewhere (tests,
   *  a future browser/PWA path), so callers fall back to the whole-buffer upload. */
  uploadMediaStream?(ref: string, uploadUrl: string, resumeFrom: number): Promise<{ remoteId: string }>;
  /** Stream a large media file from an authenticated Graph content URL straight to
   *  disk, resuming from wherever a previous partial attempt left off. Native-only. */
  downloadMediaStream?(ref: string, contentUrl: string, bearerToken: string, expectedSize: number): Promise<void>;
}

// ---- Tauri implementation (the on-disk vault) ----

const readText = (rel: string) => invoke<string | null>("read_text", { rel });
const writeText = (rel: string, contents: string) => invoke<void>("write_text", { rel, contents });
const readBytes = (rel: string) => invoke<string | null>("read_bytes", { rel });
const writeBytes = (rel: string, data: string) => invoke<void>("write_bytes", { rel, data });
const listDir = (rel: string) => invoke<string[]>("list_dir", { rel });
const removePath = (rel: string) => invoke<void>("remove_path", { rel });

const notePath = (id: string) => `notes/${id}.md`;
const metaPath = (id: string) => `notes/${id}.meta.json`;
const STATE_PATH = "sync/state.json";

interface Meta {
  title: string;
  createdAt: number;
  addedAt?: number;
  updatedAt: number;
  categories?: string[];
  tags?: string[];
  pinned?: boolean;
}

export function tauriVault(): LocalVault {
  return {
    async listNotes() {
      const files = await listDir("notes");
      const ids = files.filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
      const out: LocalNoteInfo[] = [];
      for (const id of ids) {
        const raw = await readText(metaPath(id));
        const m = raw ? (JSON.parse(raw) as Meta) : null;
        out.push({ id, updatedAt: m?.updatedAt ?? 0 });
      }
      return out;
    },

    readNote: (id) => readText(notePath(id)),

    async writeNote(id, content, times) {
      await writeText(notePath(id), content);
      // Rebuild the fast-list sidecar from the file + remote timestamps. Preserve
      // local-only fields (pinned, addedAt, original createdAt) if the note exists.
      const existingRaw = await readText(metaPath(id));
      const existing = existingRaw ? (JSON.parse(existingRaw) as Meta) : null;
      const { fields, body } = parseFrontmatter(content);
      const now = Date.now();
      const meta: Meta = {
        title: titleFromMarkdown(body),
        createdAt: existing?.createdAt ?? times?.createdAt ?? now,
        addedAt: existing?.addedAt ?? times?.createdAt ?? now,
        updatedAt: times?.updatedAt ?? now,
        categories: fields.categories,
        tags: fields.tags,
        pinned: existing?.pinned ?? false,
      };
      await writeText(metaPath(id), JSON.stringify(meta));
    },

    async deleteNote(id) {
      await removePath(notePath(id));
      await removePath(metaPath(id));
      await removePath(`timelines/${id}.json`);
    },

    async readState() {
      const raw = await readText(STATE_PATH);
      if (!raw) return { ...EMPTY_SYNC_STATE, notes: {} };
      try {
        return JSON.parse(raw) as SyncState;
      } catch {
        return { ...EMPTY_SYNC_STATE, notes: {} };
      }
    },

    writeState: (state) => writeText(STATE_PATH, JSON.stringify(state)),

    async listMedia() {
      // media/<noteId>/<file>: the top level is per-note folders, each holding the files.
      const noteDirs = await listDir(MEDIA_DIR);
      const refs: string[] = [];
      for (const noteId of noteDirs) {
        const files = await listDir(`${MEDIA_DIR}/${noteId}`);
        for (const f of files) refs.push(`${MEDIA_DIR}/${noteId}/${f}`);
      }
      return refs;
    },

    async readMediaBytes(ref) {
      const b64 = await readBytes(ref);
      return b64 == null ? null : base64ToBytes(b64);
    },

    writeMediaBytes: (ref, bytes) => writeBytes(ref, bytesToBase64(bytes)),

    mediaSize: (ref) => nativeMediaSize(ref),

    async uploadMediaStream(ref, uploadUrl, resumeFrom) {
      const remoteId = await uploadMediaChunked(ref, uploadUrl, resumeFrom);
      return { remoteId };
    },

    async downloadMediaStream(ref, contentUrl, bearerToken, expectedSize) {
      await downloadMediaChunked(ref, contentUrl, bearerToken, expectedSize);
    },
  };
}
