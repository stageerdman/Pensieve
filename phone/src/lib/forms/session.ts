// session.ts — the phone's One Question walk-through as pure data.
//
// A session = one new memory made from a form. Its body is ALWAYS rebuilt from:
//   the blank form (base) + the answers given so far + the media already on the note
// so editing an answer replaces it (applyAnswers alone only appends), and a recording the
// voice engine finalized straight into note.c (or photos/video added at the end) is kept.
// Pure: no DOM, no storage — PhoneApp owns the vault; FormSession owns the screen.

import {
  applyAnswers,
  isFormTemplate,
  memoryFromForm,
  parseForm,
  type Answers,
  type FormField,
} from "../../../../src/lib/forms";
import { joinTitleAndBody, splitTitleAndBody } from "../sync/noteFormat";
import { isMediaPath, parseNoteContent, serializeBlocks, type NoteBlock } from "../media/noteMedia";
import type { RawMemory } from "../media/rawMemoryStore";
import { findPatronus, withPatronus } from "../../../../src/lib/packages/patronus";
import type { Note } from "../../types";

export interface SessionAnswer {
  text?: string;
  scale?: number;
  /** Labels of ticked checklist items. */
  checks?: string[];
}
export type SessionAnswers = Record<string, SessionAnswer>;

export interface FormSessionModel {
  noteId: string;
  formId: string;
  formTitle: string;
  /** The blank memory (title line included), as made from the form. */
  base: string;
  fields: FormField[];
}

/** Every form on the phone (a memory flagged `form: true` by the desktop). */
export function formsIn(notes: Note[]): Note[] {
  return notes.filter((n) => isFormTemplate(n.foreign?.extra)).sort((a, b) => a.t.localeCompare(b.t));
}

export function startSession(form: Note, noteId: string, date: Date): FormSessionModel {
  const base = memoryFromForm(joinTitleAndBody(form.t, form.c), date);
  return { noteId, formId: form.id, formTitle: form.t || "Form", base, fields: parseForm(base).fields };
}

/** "bullets" when the form's question starts an empty `* ` list, "numbers" for `1.` — so a
 *  phone answer typed as plain lines lands in the shape the form asked for. */
export function answerShape(field: FormField): "text" | "bullets" | "numbers" {
  for (const l of field.text) {
    if (/^\s*[-*+]\s*$/.test(l)) return "bullets";
    if (/^\s*\d+[.)]\s*$/.test(l)) return "numbers";
  }
  return "text";
}

function shapeText(text: string, shape: ReturnType<typeof answerShape>): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (shape === "bullets") return lines.map((l) => `* ${l.replace(/^[-*+]\s+/, "")}`).join("\n");
  if (shape === "numbers") return lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+[.)]\s+/, "")}`).join("\n");
  return text.trim();
}

/** The memory's full markdown (title line included) for these answers. */
export function sessionMarkdown(s: FormSessionModel, answers: SessionAnswers): string {
  const out: Answers = {};
  for (const f of s.fields) {
    const a = answers[f.id];
    if (!a) continue;
    out[f.id] = {
      ...(a.text?.trim() ? { text: shapeText(a.text, answerShape(f)) } : {}),
      ...(a.scale ? { scale: a.scale } : {}),
      ...(a.checks?.length ? { check: a.checks } : {}),
    };
  }
  return applyAnswers(s.base, out);
}

const MEDIA = new Set<NoteBlock["kind"]>(["audio", "video", "image", "gallery"]);

/** The media blocks currently on a note body (recordings, photos, videos), in order. */
export function mediaBlocksOf(body: string): NoteBlock[] {
  return parseNoteContent(body).filter((b) => MEDIA.has(b.kind));
}

/** Rebuild the session note's title + body: the answered form, then its media at the bottom. */
export function applySession(note: Note, s: FormSessionModel, answers: SessionAnswers): void {
  const { title, body } = splitTitleAndBody(sessionMarkdown(s, answers));
  const media = mediaBlocksOf(note.c || "");
  note.t = title;
  note.c = media.length ? `${body}\n\n${serializeBlocks(media)}` : body;
}

/** Anything worth keeping? (an answer, a tick/rating, or any media) */
export function sessionHasContent(note: Note, answers: SessionAnswers): boolean {
  const any = Object.values(answers).some((a) => a.text?.trim() || a.scale || a.checks?.length);
  return !!any || mediaBlocksOf(note.c || "").length > 0;
}

// ---- PACKAGES: a finished walk-through leaves the phone as a sealed package ----

/** Every media ref on a session body (recording, photos, video) — the package carries them. */
export function sessionMediaRefs(body: string): string[] {
  const out: string[] = [];
  for (const b of mediaBlocksOf(body)) {
    if (b.kind === "audio" || b.kind === "video" || b.kind === "image") out.push(b.ref);
    else if (b.kind === "gallery") for (const im of b.images) out.push(im.ref);
  }
  return out.filter(isMediaPath);
}

/** The form template's own sync spell (a Patronus block in the form), if it has one. */
export function templateSpell(form: Note | undefined): string | null {
  return form ? (findPatronus(form.c || "")?.instruction ?? null) : null;
}

/** Seal a walk-through: the answered form + its media at the bottom + the Patronus block with
 *  the sync spell, as a raw package record with the SAME id as the session (its media already
 *  lives in media/<id>/). Desktop Patronus resolves it into that memory. */
export function packageFromSession(note: Note, formId: string, instruction: string, now = Date.now()): RawMemory {
  return {
    id: note.id,
    status: "synced",
    createdAt: note.createdAt,
    updatedAt: now,
    pages: [],
    kind: "form",
    title: note.t,
    fromForm: formId,
    markdown: withPatronus(joinTitleAndBody(note.t, note.c), { spell: "sync", instruction }),
    media: sessionMediaRefs(note.c || ""),
  };
}
