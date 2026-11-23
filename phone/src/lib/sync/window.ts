// window.ts — the phone's rolling window (PHONE-WINDOW update). The phone is a capture +
// quick-check device, so it keeps ONLY memories touched in the last WINDOW_DAYS locally:
// created then, or opened then (on the phone OR at the computer). Everything older stays
// on OneDrive/desktop and is found via the desktop-published notes index (title search,
// fetched on tap).
//
// Pure: no storage, no network. The engine feeds it the index, the phone's own open log
// and the sync state, and gets back what to keep / bring in / forget.
//
// SAFETY CONTRACT (see engine.ts):
//   · "Forget" is NOT delete. A forgotten note keeps its sync record, flagged remoteOnly,
//     so the deletion pass never mistakes it for a phone-side delete.
//   · Only CLEAN notes are forgotten — anything with an unsynced phone edit, never synced,
//     a draft, or explicitly protected (the note on screen) stays.
//   · No index = no window: without the desktop's catalogue we can't know what was opened
//     at the computer, so the phone mirrors everything, exactly as before.

import type { NoteSyncRecord } from "./types";

export const WINDOW_DAYS = 14;
export const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const NOTES_INDEX_NAME = "notes-index.json";

/** Mirrors src/lib/sync/notesIndex.ts's NotesIndexEntry — change both together. */
export interface NotesIndexEntry {
  id: string;
  /** title */
  t: string;
  /** createdAt */
  c: number;
  /** updatedAt */
  u: number;
  /** desktop lastOpenedAt */
  o?: number;
  /** first category */
  k?: string;
}

/** Parse the published index; null when it isn't a version we understand (→ no window). */
export function parseNotesIndex(json: string): NotesIndexEntry[] | null {
  try {
    const d = JSON.parse(json) as { v?: unknown; notes?: unknown };
    if (d.v !== 1 || !Array.isArray(d.notes)) return null;
    return d.notes.filter(
      (n): n is NotesIndexEntry => !!n && typeof n.id === "string" && typeof n.t === "string" && typeof n.c === "number",
    );
  } catch {
    return null;
  }
}

export interface WindowCtx {
  now: number;
  index: Map<string, NotesIndexEntry>;
  /** id → last time opened on THIS phone. */
  opens: Record<string, number>;
}

/** The latest moment that counts toward keeping a memory: created, or opened anywhere.
 *  The desktop's createdAt (index) wins over the phone's copy — it's the original date. */
export function lastTouched(id: string, ctx: WindowCtx, localCreatedAt?: number): number {
  const e = ctx.index.get(id);
  return Math.max(e?.c ?? localCreatedAt ?? 0, e?.o ?? 0, ctx.opens[id] ?? 0);
}

export function inWindow(id: string, ctx: WindowCtx, localCreatedAt?: number): boolean {
  return lastTouched(id, ctx, localCreatedAt) >= ctx.now - WINDOW_MS;
}

export interface LocalNoteForWindow {
  id: string;
  updatedAt: number;
  createdAt?: number;
  draft?: string;
  /** A form template: always kept — the phone's Form filter and "fill a form" list read
   *  forms from local notes, and a form is used for months after it was last opened. */
  form?: boolean;
}

/** Local notes safe to forget now: clean, synced, not a draft, not a form, not protected,
 *  outside the window. */
export function planForget(
  local: LocalNoteForWindow[],
  records: Record<string, NoteSyncRecord>,
  ctx: WindowCtx,
  protect: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (const n of local) {
    if (n.draft || n.form || protect.has(n.id)) continue;
    const rec = records[n.id];
    if (!rec || rec.remoteOnly) continue; // never synced (or already forgotten) — keep
    if (n.updatedAt > rec.localUpdatedAt) continue; // unsynced phone edit — keep
    if (inWindow(n.id, ctx, n.createdAt)) continue;
    out.push(n.id);
  }
  return out;
}

/** Index memories that belong in the window but aren't on the phone: the ones to bring in.
 *  A note with a live (non-remoteOnly) record that's missing locally is a pending phone-side
 *  DELETE — never resurrect it. */
export function planBringIn(
  localIds: ReadonlySet<string>,
  records: Record<string, NoteSyncRecord>,
  ctx: WindowCtx,
): string[] {
  const out: string[] = [];
  for (const id of ctx.index.keys()) {
    if (localIds.has(id)) continue;
    const rec = records[id];
    if (rec && !rec.remoteOnly) continue;
    if (inWindow(id, ctx)) out.push(id);
  }
  return out;
}

/** Media refs safe to free with the forgotten notes: referenced ONLY by forgotten notes
 *  (not by any kept note or raw batch) and confirmed backed up. */
export function planForgetMedia(
  forgottenRefs: Iterable<string>,
  keptRefs: ReadonlySet<string>,
  backedUp: (ref: string) => boolean,
): string[] {
  const out = new Set<string>();
  for (const ref of forgottenRefs) if (!keptRefs.has(ref) && backedUp(ref)) out.add(ref);
  return [...out];
}
