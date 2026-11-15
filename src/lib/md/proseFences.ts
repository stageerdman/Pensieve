// Callout and columns fences hold PROSE (unlike media/form fences): for previews and the
// search haystack they read as their text — no fence marker, no `icon=` line, no column
// marker. Shared by desktop (lib/text) and the phone reel preview, so both agree.

import { CALLOUT_FENCE, parseCalloutText } from "./callout";
import { COLUMNS_FENCE, splitColumns } from "./columns";

// A whole fence: opening line, body (never contains ``` — the importer guarantees it), closing line.
const PROSE_FENCE = new RegExp(`^\`\`\`(${CALLOUT_FENCE}|${COLUMNS_FENCE})[ \\t]*\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, "gm");

/** Replace every callout/columns fence with its plain body markdown (other fences untouched). */
export function unwrapProseFences(md: string): string {
  if (!md.includes("```pensieve:c")) return md; // fast path: most notes have none
  return md.replace(PROSE_FENCE, (_m, lang: string, raw: string) => {
    const body = raw.replace(/\n$/, "");
    return lang === CALLOUT_FENCE ? parseCalloutText(body).body : splitColumns(body).join("\n\n");
  });
}
