// meta.ts — the forms frontmatter keys, read/written through one place.
//
// A form is an ordinary memory; what makes it special is just frontmatter, carried in
// NoteFields.extra / ForeignMeta.extra (raw string values, round-tripped verbatim):
//   form: true           — this memory IS a form template (offered on new memories)
//   fromForm: <noteId>   — this memory was made from that template (drives its charm buttons)
//   formStatus: awaiting — a phone session waiting for the desktop to transcribe + fill it
//
// Pure + dependency-free: shared by the desktop app AND the phone PWA (imported directly).

export type Extra = Record<string, string> | undefined;

export const FORM_KEY = "form";
export const FROM_FORM_KEY = "fromForm";
export const FORM_STATUS_KEY = "formStatus";
export type FormStatus = "awaiting";

export function isFormTemplate(extra: Extra): boolean {
  return extra?.[FORM_KEY] === "true";
}

export function fromFormId(extra: Extra): string | undefined {
  const v = extra?.[FROM_FORM_KEY]?.trim();
  return v ? v : undefined;
}

export function isAwaitingProcessing(extra: Extra): boolean {
  return extra?.[FORM_STATUS_KEY] === "awaiting";
}

/** Return a copy of `extra` with `key` set (or removed when `value` is undefined).
 *  Returns undefined when nothing is left, so "no metadata" stays "no frontmatter". */
export function withExtra(extra: Extra, key: string, value: string | undefined): Extra {
  const next: Record<string, string> = { ...(extra ?? {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}
