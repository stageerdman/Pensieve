import { plainTextFromMarkdown } from "../text";
import { extractMediaRefs } from "../media/ref";
import { transcriptPlainText } from "../transcripts/transcript";
import type { Transcript } from "../transcripts/types";

// The ONE definition of a note's searchable body: its markdown as plain text, plus the
// plain text of every referenced recording's transcript sidecar. Transcripts live beside
// the audio (never in the `.md`), so without this fold spoken words would be invisible to
// Accio. Shared by the batch `Store.bodies()` (both adapters) and the single-note reindex
// path (useSearchIndex) so a freshly-created transcript is folded in exactly the same way a
// full rebuild would fold it — no drift between the two.
export async function buildSearchBody(
  markdown: string,
  loadTranscript: (ref: string) => Promise<Transcript | null>,
): Promise<string> {
  let text = plainTextFromMarkdown(markdown);
  for (const ref of extractMediaRefs(markdown)) {
    const t = await loadTranscript(ref);
    if (t) text += " " + transcriptPlainText(t);
  }
  return text;
}
