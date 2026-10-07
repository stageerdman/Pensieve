// Local vault access for the sync engine. The engine works at the raw `.md` file
// level (the source of truth, frontmatter + body) rather than the Note model, so a
// pulled remote file lands on disk byte-for-byte. This interface is injectable so
// the engine is unit-testable with an in-memory vault.

import { invoke } from "@tauri-apps/api/core";
import type { SyncState } from "./types";
import { EMPTY_SYNC_STATE } from "./types";
import { parseFrontmatter } from "../md/frontmatter";
import { titleFromMarkdown } from "../text";

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
}

// ---- Tauri implementation (the on-disk vault) ----

const readText = (rel: string) => invoke<string | null>("read_text", { rel });
const writeText = (rel: string, contents: string) => invoke<void>("write_text", { rel, contents });
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
  };
}
