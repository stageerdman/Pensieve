// protocol.ts — one Patronus STEP when a package is resolved on the desktop.
//
// "Patronus is the brain, the app is the hands": each step Patronus sees the package (its
// body, its media and what's known about them), the SPELL (instruction) and what's been done
// so far, and answers with the actions it chooses. The app executes them with its own safety
// rails (applyAnswers never overrides the owner; a Timeline restore point; sync) and asks
// again until Patronus says `finish`. No per-kind pipeline is hard-coded — the spell decides.
// Pure: build the prompt, parse + validate the reply.

import type { Answers } from "../forms";
import type { FormField } from "../forms";
import { describeField, parseFillResponse, type FillField } from "../formFill/prompt";
import type { PackageKind } from "./kinds";

export type Language = "english" | "czech";

export type Action =
  | { do: "transcribe"; ref: string; language: Language }
  | { do: "fill_form"; answers: Answers }
  | { do: "finish" };

export interface PackageMedia {
  ref: string;
  kind: "audio" | "video" | "image";
  /** The transcript text if one exists (null = not transcribed yet). */
  transcript: string | null;
  /** Which language the existing transcript was made with, if known. */
  language?: Language;
}

export interface StepContext {
  kind: PackageKind;
  title: string;
  instruction: string;
  /** The package body as it stands now (Patronus block removed). */
  markdown: string;
  /** Form packages: the fields + what's already answered. */
  fields: FillField[];
  media: PackageMedia[];
  /** One line per action already executed in this run, with its outcome. */
  done: string[];
}

export const MAX_STEPS = 4;

function mediaLine(m: PackageMedia): string {
  if (m.kind === "image") return `- ${m.ref} (photo)`;
  if (m.transcript === null) return `- ${m.ref} (${m.kind} recording, NOT transcribed yet)`;
  const lang = m.language ? `, transcribed as ${m.language}` : "";
  return `- ${m.ref} (${m.kind} recording${lang}) transcript:\n"""\n${m.transcript.trim()}\n"""`;
}

export function buildStepPrompt(ctx: StepContext): string {
  const actions = [
    `{"do": "transcribe", "ref": "<recording ref>", "language": "english" | "czech"} — run the local speech-to-text on a recording. Pick the language the owner most likely spoke (the instruction may say). Re-transcribe only if an existing transcript is clearly in the wrong language or the instruction asks for it.`,
    ...(ctx.kind === "form"
      ? [`{"do": "fill_form", "answers": {"<field id>": {"text": "<markdown>", "scale": <number>, "check": ["<exact item label>"]}}} — write answers into the form from what the owner SAID. Answers are added after anything already typed (never repeat it); a scale is set only if unrated; checklist items are only ever ticked. Same language the owner spoke, first person, their own words, concise, no invented facts, no commentary. Leave out fields the recording says nothing about. Use "* " bullet lines for lists.`]
      : []),
    `{"do": "finish"} — the spell is fully done. Always the last action.`,
  ];
  return `You are Patronus, the AI inside the owner's journaling app. A ${ctx.kind} package "${ctx.title}" just arrived from their phone. Execute its spell.

THE SPELL (the owner's instruction for this package):
"""
${ctx.instruction.trim()}
"""

The package:
"""
${ctx.markdown.trim()}
"""
${ctx.kind === "form" ? `\nThe form's fields:\n${ctx.fields.map(describeField).join("\n")}\n` : ""}
Media in the package:
${ctx.media.length ? ctx.media.map(mediaLine).join("\n") : "(none)"}

Already done in this run:
${ctx.done.length ? ctx.done.map((d) => `- ${d}`).join("\n") : "(nothing yet)"}

Actions you can take:
${actions.map((a) => `- ${a}`).join("\n")}

Return the next actions in order. If you need a transcript first, return just the transcribe action(s) — you'll be asked again with the transcript. When everything the spell asks for is done, end with finish.

Respond with ONLY one JSON object, no markdown fence, no explanation:
{"actions": [ ... ]}`;
}

/** Defensive parse: tolerate a fence / prose around the JSON; keep only well-formed actions
 *  for things that exist (known recording refs, real field ids). Never throws. */
export function parseStep(raw: string, ctx: Pick<StepContext, "kind" | "media"> & { formFields?: FormField[] }): Action[] {
  let text = raw.trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { actions?: unknown })?.actions;
  if (!Array.isArray(list)) return [];
  const recordings = new Set(ctx.media.filter((m) => m.kind !== "image").map((m) => m.ref));
  const out: Action[] = [];
  for (const a of list as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    if (a.do === "transcribe" && typeof a.ref === "string" && recordings.has(a.ref)) {
      out.push({ do: "transcribe", ref: a.ref, language: a.language === "czech" ? "czech" : "english" });
    } else if (a.do === "fill_form" && ctx.kind === "form" && ctx.formFields) {
      const answers = parseFillResponse(JSON.stringify({ answers: a.answers ?? {} }), ctx.formFields);
      if (Object.keys(answers).length) out.push({ do: "fill_form", answers });
    } else if (a.do === "finish") {
      out.push({ do: "finish" });
      break; // nothing after finish counts
    }
  }
  return out;
}
