// Test fixtures for note spells: memories, a fake Claude, a fake vault. Test-only.

import { vi } from "vitest";
import type { Note, NoteMeta, TimelineEntry } from "../../types";
import { patronusFence, type PatronusHeaders } from "../../packages/patronus";
import { storageLedger } from "./ledger";
import type { NoteSpellJobDeps } from "./job";

export const AUDIO = "media/n1/dreams.m4a";
export const VOICE = "media/n1/cmd.m4a";
export const PHOTO = "media/n1/sky.jpg";
export const DREAMS = "Create a bullet list of dreams we've mentioned, after that remove recording";

export const spellFence = (instruction: string, headers: PatronusHeaders = { state: "pending" }) =>
  patronusFence({ spell: "sync", instruction, headers });

export const audioFence = (ref: string) => "```pensieve:audio\n" + ref + "\n```";

export const note = (markdown: string, extra?: Record<string, string>): Note => ({
  id: "n1",
  title: "Morning",
  markdown,
  createdAt: 1,
  addedAt: 1,
  updatedAt: 1,
  categories: [],
  tags: [],
  links: [],
  pinned: false,
  starred: false,
  ...(extra ? { extra } : {}),
});

/** Claude that answers each step from a script (one JSON reply per call). */
export const scripted = (...steps: unknown[]) => {
  let i = 0;
  return vi.fn(async (_prompt: string) => {
    const s = steps[Math.min(i++, steps.length - 1)];
    return typeof s === "string" ? s : JSON.stringify(s);
  });
};

/** An in-memory vault with a Map-backed ledger; `onRefresh` simulates a phone edit landing. */
export function fakeVault(initial: Note[], onRefresh?: (notes: Map<string, Note>) => void) {
  const notes = new Map(initial.map((n) => [n.id, n]));
  const timelines = new Map<string, TimelineEntry[]>();
  const kv = new Map<string, string>();
  const saves: Note[] = [];
  const deps = (ask: NoteSpellJobDeps["ask"], over: Partial<NoteSpellJobDeps> = {}): NoteSpellJobDeps => ({
    load: async (id) => notes.get(id) ?? null,
    save: async (n) => {
      saves.push(n);
      notes.set(n.id, n);
    },
    loadTimeline: async (id) => timelines.get(id) ?? [],
    saveTimeline: async (id, e) => void timelines.set(id, e),
    ledger: storageLedger({ getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) }),
    refresh: async () => onRefresh?.(notes),
    ask,
    transcribe: async () => "I dreamt of a red boat. Then a dream about flying over Prague.",
    loadTranscript: async () => null,
    status: () => {},
    now: () => new Date("2026-11-22T08:00:00Z"),
    ...over,
  });
  const store = {
    list: async (): Promise<NoteMeta[]> => [...notes.values()].map((n) => ({ ...n }) as unknown as NoteMeta),
    load: async (id: string) => notes.get(id) ?? null,
    listMedia: async () => [AUDIO, VOICE, PHOTO],
  };
  return { notes, timelines, saves, deps, store };
}
