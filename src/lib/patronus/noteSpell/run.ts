// run.ts — carry out ONE note spell on the Mac: Patronus reads the spell and decides; the app
// checks (guards.ts) and executes. Loop: ask → guard the whole step → execute → ask again with
// the new state … until `finish` (or MAX_STEPS). Same deps as the package loop (lib/packages/
// run), so it runs in tests with a fake Claude and a fake transcriber.
// Nothing is written here: the result goes back to the queue job, which saves it once.

import type { Language } from "../../packages/protocol";
import type { RunDeps } from "../../packages/run";
import { log } from "../../logger";
import { contentOf, type NoteSpell } from "./block";
import { NoteSpellFailure, classifyAskError } from "./errors";
import { guardStep } from "./guards";
import { mediaIn, mediaKind, unlinkMedia } from "./media";
import { MAX_STEPS, buildNoteStepPrompt, parseNoteStep, type NoteAction, type NoteMedia, type Where } from "./protocol";

export type NoteSpellDeps = RunDeps;

export interface NoteSpellInput {
  id: string;
  title: string;
  spell: NoteSpell;
}

export interface NoteSpellResult {
  before: string[];
  after: string[];
  /** One line for the block's `did:` header. */
  did: string;
  /** Media unlinked from the memory (bytes kept everywhere). */
  removed: string[];
  done: string[];
}

type Parts = Pick<NoteSpell, "before" | "after">;
type Transcript = { text: string; language?: Language };

const LANG_LABEL: Record<Language, string> = { english: "English", czech: "Czech" };

const isBlank = (lines: string[]) => lines.every((l) => !l.trim());

function trimTrailingBlanks(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  return lines.slice(0, end);
}

function addText(parts: Parts, markdown: string, where: Where): Parts {
  const lines = markdown.split("\n");
  if (where === "end") return { before: parts.before, after: [...trimTrailingBlanks(parts.after), "", ...lines] };
  const gap = parts.after[0]?.trim() ? [""] : [];
  return { before: parts.before, after: ["", ...lines, ...gap, ...parts.after] };
}

/** The new text replaces the memory's text; the block stays where it was relative to it
 *  (on top when it was on top, else below). */
function rewriteText(parts: Parts, markdown: string): Parts {
  const lines = markdown.split("\n");
  return isBlank(parts.before) ? { before: [], after: ["", ...lines] } : { before: [...lines, ""], after: [] };
}

const unlink = (lines: string[], ref: string) => unlinkMedia(lines.join("\n"), ref).split("\n");

function removeMedia(parts: Parts, ref: string): Parts {
  return { before: unlink(parts.before, ref), after: unlink(parts.after, ref) };
}

export async function runNoteSpell(input: NoteSpellInput, deps: NoteSpellDeps): Promise<NoteSpellResult> {
  const { block } = input.spell;
  const voiceRef = block.headers?.voice?.trim() || null;
  let parts: Parts = { before: input.spell.before, after: input.spell.after };
  const done: string[] = [];
  const removed = new Set<string>();
  const known = new Map<string, Transcript>();

  const transcriptOf = async (ref: string): Promise<Transcript | null> => known.get(ref) ?? (await deps.loadTranscript(ref));
  const toMedia = async (ref: string): Promise<NoteMedia> => {
    const kind = mediaKind(ref);
    const t = kind === "image" ? null : await transcriptOf(ref);
    return { ref, kind, transcript: t?.text ?? null, ...(t?.language ? { language: t.language } : {}) };
  };

  for (let step = 1; step <= MAX_STEPS; step++) {
    const content = contentOf(parts);
    const contentMedia = mediaIn(content);
    const media = await Promise.all(contentMedia.map((m) => toMedia(m.ref)));
    const voice = voiceRef ? await toMedia(voiceRef) : null;
    const prompt = buildNoteStepPrompt({ title: input.title, instruction: block.instruction, voice, content, media, done });

    deps.status(step === 1 ? "Reading the spell" : "Thinking");
    log.info("patronus-note", "step.ask", { id: input.id, step, media: media.length, done: done.length });
    const reply = await deps.ask(prompt).catch((e: unknown) => {
      throw classifyAskError(e);
    });
    const { actions, unknown } = parseNoteStep(reply);
    log.info("patronus-note", "step.actions", { id: input.id, step, actions: actions.map((a) => a.do), unknown });
    if (unknown) throw new NoteSpellFailure("Patronus asked for something it may not do");
    if (!actions.length) throw new NoteSpellFailure("Patronus didn't say what to do");

    const recordings = [...contentMedia.filter((m) => m.kind !== "image").map((m) => m.ref), ...(voiceRef ? [voiceRef] : [])];
    guardStep(actions, { contentRefs: contentMedia.map((m) => m.ref), voiceRef, recordings });

    for (const a of actions) {
      if (a.do === "finish") {
        for (const ref of removed) parts = removeMedia(parts, ref);
        deps.status("Finishing");
        log.info("patronus-note", "run.finish", { id: input.id, steps: step, done: done.length, removed: removed.size });
        return { ...parts, did: a.summary || done.join("; ") || "Done", removed: [...removed], done };
      }
      parts = await execute(a, parts, { deps, known, removed, done });
    }
    // A rewrite in the same step as a remove may still mention the removed media: unlink again.
    for (const ref of removed) parts = removeMedia(parts, ref);
  }
  throw new NoteSpellFailure(`Patronus didn't finish within ${MAX_STEPS} steps`);
}

interface ExecState {
  deps: NoteSpellDeps;
  known: Map<string, Transcript>;
  removed: Set<string>;
  done: string[];
}

async function execute(a: Exclude<NoteAction, { do: "finish" }>, parts: Parts, s: ExecState): Promise<Parts> {
  switch (a.do) {
    case "transcribe": {
      s.deps.status(`Transcribing · ${LANG_LABEL[a.language]}`);
      // A transcriber error is the Mac's problem, not the spell's: let it through unwrapped.
      const text = await s.deps.transcribe(a.ref, a.language);
      s.known.set(a.ref, { text, language: a.language });
      s.done.push(`transcribed ${a.ref} as ${a.language}`);
      return parts;
    }
    case "add_text":
      s.deps.status("Writing");
      s.done.push(`added text (${a.where === "end" ? "at the end" : "below the spell"})`);
      return addText(parts, a.markdown, a.where);
    case "rewrite_text":
      s.deps.status("Rewriting");
      s.done.push("rewrote the text");
      return rewriteText(parts, a.markdown);
    case "remove_media":
      s.removed.add(a.ref);
      s.done.push(`moved ${a.ref} to Trash`);
      return removeMedia(parts, a.ref);
  }
}
