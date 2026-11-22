// guards.ts — the app's safety rails over one step's actions. Patronus decides; the app
// refuses anything outside these rules, for the WHOLE step (nothing half-applied):
//   · transcribe: only a recording in this memory, or the spoken spell's own recording.
//   · remove_media: only media in this memory's text — never the spell's own recording.
//   · add_text / rewrite_text: no media refs that aren't already there, no Patronus block
//     (a new pending block would make the memory run itself again).
//   · rewrite_text: every media the memory holds must still be there, unless this step also
//     removes it with remove_media — a rewrite can never silently drop a recording.
// Pure. Throws NoteSpellFailure with a reason the owner can read.

import { extractMediaRefs } from "../../media/ref";
import { PATRONUS_LANG } from "../../packages/patronus";
import { NoteSpellFailure } from "./errors";
import type { NoteAction } from "./protocol";

export interface GuardContext {
  /** Media refs in the memory's text right now. */
  contentRefs: string[];
  /** The spoken spell's recording, if any. */
  voiceRef: string | null;
  /** Recordings that can be transcribed (content audio/video + the voice ref). */
  recordings: string[];
}

function checkNewText(markdown: string, allowed: Set<string>): void {
  if (markdown.includes(PATRONUS_LANG)) throw new NoteSpellFailure("Patronus tried to write a new Patronus block");
  const foreign = extractMediaRefs(markdown).filter((r) => !allowed.has(r));
  if (foreign.length) throw new NoteSpellFailure(`Patronus tried to add media that isn't in this memory (${foreign[0]})`);
}

export function guardStep(actions: NoteAction[], ctx: GuardContext): void {
  const content = new Set(ctx.contentRefs);
  const removed = new Set(actions.flatMap((a) => (a.do === "remove_media" ? [a.ref] : [])));
  for (const a of actions) {
    if (a.do === "transcribe" && !ctx.recordings.includes(a.ref)) {
      throw new NoteSpellFailure(`Patronus tried to transcribe a recording that isn't in this memory (${a.ref})`);
    }
    if (a.do === "remove_media") {
      if (a.ref === ctx.voiceRef) throw new NoteSpellFailure("Patronus tried to remove the spell's own recording");
      if (!content.has(a.ref)) throw new NoteSpellFailure(`Patronus tried to remove media that isn't in this memory (${a.ref})`);
    }
    if (a.do === "add_text") checkNewText(a.markdown, new Set());
    if (a.do === "rewrite_text") {
      checkNewText(a.markdown, content);
      const kept = new Set(extractMediaRefs(a.markdown));
      const dropped = ctx.contentRefs.filter((r) => !kept.has(r) && !removed.has(r));
      if (dropped.length) throw new NoteSpellFailure(`Patronus's rewrite dropped media without removing it (${dropped[0]})`);
    }
  }
}
