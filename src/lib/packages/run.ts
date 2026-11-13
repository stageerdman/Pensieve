// run.ts — resolve one package on the desktop: Patronus reads the spell and decides; the app
// executes. Loop: ask → execute the actions (transcribe / fill_form) → ask again with the
// new state … until Patronus returns `finish` (or MAX_STEPS). Deps are injected, so the whole
// loop runs in tests with a fake Claude and a fake transcriber.

import { applyAnswers, parseForm, type FormField } from "../forms";
import { fillFieldsOf } from "../formFill/prompt";
import type { PackageKind } from "./kinds";
import { findPatronus, withoutPatronus } from "./patronus";
import { MAX_STEPS, buildStepPrompt, parseStep, type Language, type PackageMedia } from "./protocol";
import { log } from "../logger";

export interface RunInput {
  id: string;
  kind: PackageKind;
  title: string;
  /** The sealed package body, ending in its Patronus block. */
  markdown: string;
  /** The default instruction if the body somehow has no Patronus block. */
  fallbackInstruction: string;
  /** Form packages: the form template's own fields (tells guidance apart from typed text). */
  templateFields?: FormField[];
}

export interface RunDeps {
  ask(prompt: string): Promise<string>;
  /** Run the local engine on a recording; resolves with its transcript text. */
  transcribe(ref: string, language: Language): Promise<string>;
  /** Existing transcript text for a recording, or null. */
  loadTranscript(ref: string): Promise<{ text: string; language?: Language } | null>;
  /** Live status for the Process row ("Transcribing · English", "Filling the form"). */
  status(text: string): void;
}

export interface RunResult {
  /** The resolved body: Patronus block consumed, answers written in. */
  markdown: string;
  /** What happened, one line per executed action (logged + kept for the Timeline). */
  done: string[];
}

const MEDIA = /```pensieve:(audio|video)\n([^\n]+)|!\[[^\]]*\]\((media\/[^)\s]+)\)/g;

export function mediaRefsOf(markdown: string): { ref: string; kind: PackageMedia["kind"] }[] {
  const out: { ref: string; kind: PackageMedia["kind"] }[] = [];
  for (const m of markdown.matchAll(MEDIA)) {
    if (m[1]) out.push({ ref: m[2].trim(), kind: m[1] as "audio" | "video" });
    else if (m[3]) out.push({ ref: m[3], kind: "image" });
  }
  return out;
}

const LANG_LABEL: Record<Language, string> = { english: "English", czech: "Czech" };

export async function runPackage(input: RunInput, deps: RunDeps): Promise<RunResult> {
  const instruction = findPatronus(input.markdown)?.instruction || input.fallbackInstruction;
  let markdown = withoutPatronus(input.markdown);
  const done: string[] = [];
  const known = new Map<string, { text: string; language?: Language }>();

  for (let step = 1; step <= MAX_STEPS; step++) {
    const media: PackageMedia[] = await Promise.all(
      mediaRefsOf(markdown).map(async ({ ref, kind }) => {
        const t = kind === "image" ? null : (known.get(ref) ?? (await deps.loadTranscript(ref)));
        return { ref, kind, transcript: t?.text ?? null, ...(t?.language ? { language: t.language } : {}) };
      }),
    );
    const formFields = input.kind === "form" ? parseForm(markdown).fields : undefined;
    const prompt = buildStepPrompt({
      kind: input.kind,
      title: input.title,
      instruction,
      markdown,
      fields: formFields ? fillFieldsOf(formFields, input.templateFields) : [],
      media,
      done,
    });
    deps.status(step === 1 ? "Reading the spell" : "Thinking");
    log.info("package", "step.ask", { id: input.id, step, media: media.length, done: done.length });
    const actions = parseStep(await deps.ask(prompt), { kind: input.kind, media, formFields });
    log.info("package", "step.actions", { id: input.id, step, actions: actions.map((a) => a.do) });
    if (!actions.length) throw new Error("Patronus didn't say what to do");

    for (const a of actions) {
      if (a.do === "transcribe") {
        deps.status(`Transcribing · ${LANG_LABEL[a.language]}`);
        const text = await deps.transcribe(a.ref, a.language);
        known.set(a.ref, { text, language: a.language });
        done.push(`transcribed ${a.ref} as ${a.language}`);
      } else if (a.do === "fill_form") {
        deps.status("Filling the form");
        markdown = applyAnswers(markdown, a.answers);
        done.push(`filled ${Object.keys(a.answers).length} field(s): ${Object.keys(a.answers).join(", ")}`);
      } else if (a.do === "finish") {
        deps.status("Finishing");
        log.info("package", "run.finish", { id: input.id, steps: step, done });
        return { markdown, done };
      }
    }
  }
  throw new Error(`Patronus didn't finish within ${MAX_STEPS} steps`);
}
