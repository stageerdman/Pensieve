// Test-only: the Store slice the job uses, laid out on any VaultFiles exactly like the
// Tauri store (raw/<id>.json; record removed before its photos; note sidecar before .md),
// so the kill tests exercise the real on-disk protocol on a memory or a real temp disk.
import type { Note, RawMemory, Store } from "../../../types";
import type { Transcript } from "../../../transcripts/types";
import { transcriptRefFor } from "../../../transcripts/transcript";
import type { VaultFiles } from "../vaultFiles";

export type JobTestStore = Pick<
  Store,
  "listRawMemories" | "loadRawMemory" | "saveRawMemory" | "removeRawMemory" | "save" | "saveTranscript"
>;

export function vaultStore(files: VaultFiles): JobTestStore {
  return {
    async listRawMemories() {
      const names = (await files.list("raw")).filter((n) => n.endsWith(".json") && !n.startsWith("."));
      const out: RawMemory[] = [];
      for (const n of names) out.push(JSON.parse((await files.readText(`raw/${n}`))!) as RawMemory);
      return out;
    },
    async loadRawMemory(id) {
      const raw = await files.readText(`raw/${id}.json`);
      return raw ? (JSON.parse(raw) as RawMemory) : null;
    },
    async saveRawMemory(rm) {
      await files.writeText(`raw/${rm.id}.json`, JSON.stringify({ ...rm, updatedAt: Date.now() }));
    },
    async removeRawMemory(id) {
      const photos = await files.list(`media/${id}`);
      await files.remove(`raw/${id}.json`);
      for (const f of photos) await files.remove(`media/${id}/${f}`);
    },
    async save(note: Note) {
      await files.writeText(`notes/${note.id}.meta.json`, JSON.stringify({ createdAt: note.createdAt }));
      await files.writeText(`notes/${note.id}.md`, note.markdown);
    },
    async saveTranscript(ref: string, t: Transcript) {
      await files.writeText(transcriptRefFor(ref), JSON.stringify(t));
    },
  };
}
