// remoteStubs.ts — PHONE-WINDOW: older memories that aren't on the phone, as title-only
// Note stubs for Accio. Built from the notes index the sync engine caches locally
// (vault.ts INDEX_KEY). Only search shows them — the reel stays the local window.

import type { Note } from "../../types";
import { labelFromEpoch } from "./noteFormat";
import type { NotesIndexEntry } from "./window";

const INDEX_KEY = "pensieve.phone.notesIndex";
let cache: { raw: string; entries: NotesIndexEntry[] } | null = null;

/** The cached index entries; re-parsed only when the stored copy changed. */
function indexEntries(): NotesIndexEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(INDEX_KEY);
  } catch {
    /* unavailable */
  }
  if (!raw) return [];
  if (cache?.raw !== raw) {
    try {
      cache = { raw, entries: JSON.parse(raw) as NotesIndexEntry[] };
    } catch {
      cache = { raw, entries: [] };
    }
  }
  return cache.entries;
}

/** Stubs for every indexed memory not in `local`. Pure given the entries. */
export function stubsFrom(entries: NotesIndexEntry[], local: ReadonlyArray<{ id: string }>): Note[] {
  const have = new Set(local.map((n) => n.id));
  const out: Note[] = [];
  for (const e of entries) {
    if (have.has(e.id) || !e.t) continue;
    out.push({
      id: e.id,
      t: e.t,
      c: "",
      cat: "--cat-blue",
      shape: "vial",
      fill: 0.18,
      d: labelFromEpoch(e.u || e.c),
      created: labelFromEpoch(e.c),
      createdAt: e.c,
      updatedAt: e.u,
      remote: true,
    });
  }
  // newest first, so within a ranking tier recent older-memories lead
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function remoteStubs(local: ReadonlyArray<{ id: string }>): Note[] {
  return stubsFrom(indexEntries(), local);
}
