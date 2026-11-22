// queue.ts — "which memories have a note spell for the Mac to act on?" — the Process queue's
// note-spell rows. Reads only list() metadata (the phone's `patronus:` hint), loads just the
// flagged memories and re-checks the block itself. A memory whose media (content or the
// spoken spell) hasn't arrived yet waits for the next sync instead of failing.

import type { NoteMeta, Store } from "../../types";
import { log } from "../../logger";
import { contentOf, findNoteSpell, hasHint, isRunnableNoteSpell } from "./block";
import { mediaIn, mediaKind } from "./media";

export interface NoteSpellQueueItem {
  noteId: string;
  title: string;
  /** Its recordings (content + spoken spell): the queue holds the spell back while any is
   *  still queued to transcribe in its own row, so nothing is transcribed twice. */
  audioRefs: string[];
}

export type NoteSpellQueueStore = Pick<Store, "list" | "load" | "listMedia">;

export async function listNoteSpellsToRun(store: NoteSpellQueueStore): Promise<NoteSpellQueueItem[]> {
  const flagged = (await store.list()).filter((m: NoteMeta) => hasHint(m.extra));
  if (!flagged.length) return [];
  const have = new Set(await store.listMedia());
  const out: NoteSpellQueueItem[] = [];
  for (const m of flagged) {
    const note = await store.load(m.id);
    if (!note || !isRunnableNoteSpell(note)) continue;
    const spell = findNoteSpell(note.markdown)!;
    const voice = spell.block.headers?.voice?.trim();
    const media = [...mediaIn(contentOf(spell)), ...(voice ? [{ ref: voice, kind: mediaKind(voice) }] : [])];
    const missing = media.filter((x) => !have.has(x.ref)).length;
    if (missing) {
      log.info("patronus-note", "queue.wait-media", { id: m.id, missing });
      continue;
    }
    const audioRefs = media.filter((x) => x.kind !== "image").map((x) => x.ref);
    out.push({ noteId: m.id, title: m.title || "Memory", audioRefs });
  }
  return out;
}
