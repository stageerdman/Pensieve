// kinds.ts — what kinds of package exist and the sync spell each one gets by default.
// A form template can override the form default with its own Patronus block.
// Pure + dependency-free (shared with the phone PWA).

export type PackageKind = "journal" | "form";

export const DEFAULT_SPELL: Record<PackageKind, string> = {
  form: "Transcribe the recording and fill in the form from it.",
  journal: "Read these handwritten pages and turn them into dated memories.",
};

/** The instruction a package of this kind gets: the template's own (if it has one) or the
 *  default. */
export function spellFor(kind: PackageKind, templateInstruction?: string | null): string {
  return templateInstruction?.trim() || DEFAULT_SPELL[kind];
}
