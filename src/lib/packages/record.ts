// record.ts — a PACKAGE on disk is a raw-memory record (raw/<id>.json, the same sealed,
// synced, hidden-from-notes slot Journal batches use) with a few extra fields. Shared shape
// helpers so desktop + phone agree. Pure + dependency-free (the phone imports it).
//
//   { id, status, createdAt, updatedAt, pages: [],         ← Journal fields (pages = photos)
//     kind: "form", title, fromForm, markdown, media }      ← package fields
//
// A form package RESOLVES INTO a memory with the SAME id, so its media (media/<id>/…) is
// already where the memory needs it — never copied, never re-downloaded, and therefore never
// deleted when the record goes away (only `pages` are a Journal batch's own files).

import type { PackageKind } from "./kinds";

export interface PackageFields {
  pages: string[];
  /** Absent = a Journal batch (the original raw memory). */
  kind?: PackageKind;
  /** Display name (the form's name + date). */
  title?: string;
  /** The form template it was made from. */
  fromForm?: string;
  /** The sealed body: questions, typed answers, media fences, then the Patronus block. */
  markdown?: string;
  /** Media refs beyond `pages` (recordings, photos, video) — synced like pages. */
  media?: string[];
}

export function packageKind(r: Pick<PackageFields, "kind">): PackageKind {
  return r.kind ?? "journal";
}

/** Every media ref the record carries — what sync must download for it. */
export function recordMediaRefs(r: Pick<PackageFields, "pages" | "media">): string[] {
  return [...new Set([...(r.pages ?? []), ...(r.media ?? [])])];
}
