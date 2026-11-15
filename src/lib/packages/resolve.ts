// resolve.ts — what a resolved form package BECOMES: a normal memory with the SAME id (its
// media/<id>/ files are already in place), the resolved body, its original capture time,
// and `fromForm` so its charms + "Redo with AI…" keep working. Pure.

import { FROM_FORM_KEY } from "../forms";
import type { Note, RawMemory, TimelineEntry } from "../types";
import type { Transcript } from "../transcripts/types";
import type { TranscriptionModel } from "../transcripts/models";
import type { Language } from "./protocol";
import { withoutPatronus } from "./patronus";

export function memoryFromPackage(rm: RawMemory, resolvedMarkdown: string, now = Date.now()): Note {
  return {
    id: rm.id,
    title: "",
    markdown: resolvedMarkdown,
    createdAt: rm.createdAt,
    addedAt: now,
    updatedAt: now,
    categories: [],
    tags: [],
    links: [],
    pinned: false,
    starred: false,
    ...(rm.fromForm ? { extra: { [FROM_FORM_KEY]: rm.fromForm } } : {}),
  };
}

/** The memory's first Timeline entry: what the phone sent (Patronus block left out) — the
 *  point "Redo with AI…" returns to. */
export function packageRestorePoint(rm: RawMemory, now = Date.now()): TimelineEntry {
  return { ts: now - 1, wordDelta: 0, markdown: withoutPatronus(rm.markdown ?? ""), label: "before-ai" };
}

export function transcriptLanguage(t: Transcript): Language | undefined {
  const m = `${t.meta?.model ?? ""} ${t.meta?.language ?? ""}`.toLowerCase();
  if (m.includes("czech") || /\bcs\b/.test(m)) return "czech";
  if (m.includes("parakeet") || m.includes("english") || /\ben\b/.test(m)) return "english";
  return undefined;
}

export const modelForLanguage = (l: Language): TranscriptionModel => (l === "czech" ? "czech-whisper" : "parakeet");
