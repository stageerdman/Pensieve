// The real (Tauri-only) implementation of DescribePage — shells out to the logged-in
// `claude` CLI via the describe_journal_page command (src-tauri/src/ai_vision.rs). AI
// processing is desktop-only (CLAUDE.md), so this file is only ever imported behind an
// isTauri() check (see useProcessQueue.ts) — it has no browser fallback, intentionally.
import { invoke } from "@tauri-apps/api/core";
import type { PageDescription } from "./processRawBatch";
import { log } from "../logger";

/** Exported so a test can lock in the owner's two explicit requirements (guess-and-flag
 *  illegible words; standardize + YYYY-placeholder the date) rather than only hoping a
 *  future prompt edit doesn't silently drop them. */
export const PROMPT_TEMPLATE = (absolutePath: string) => `Read the handwritten journal page image at this exact path: ${absolutePath}

Transcribe every word of handwriting on the page, in reading order. Never skip a word — if one is hard to read, make your best guess and wrap JUST that guessed word in curly braces, like {guess}, so it's clearly flagged as uncertain rather than silently dropped. Only leave the transcript empty if the page is truly blank.

Then look for a DATE HEADER the writer put on this page (they write dates inconsistently — "20th of October", "20/10", "Mon Nov 3", etc.). A page normally has at most one NEW date header. If you find one, standardize it to exactly this format: "<day as a plain number, no "1st"/"2nd" suffix> <full English month name> <year>" — e.g. "18 October 2024". If the page does NOT show a year, write the literal placeholder text "YYYY" where the year goes (e.g. "18 October YYYY") — do not guess a year yourself from context; that's resolved later across the whole batch, not per page.

If this page ALSO shows the tail end of a PREVIOUS day's entry before this page's own new date header starts further down the SAME page (continuesPrevious), split your transcription at exactly that point: put the text that comes BEFORE the new date header into "previousPart", and put ONLY the text FROM the new date header onward into "transcript". These two memories will be shown separately, so neither should repeat the other's text. If there's no such split, leave "previousPart" null and put the page's whole text into "transcript" as usual.

Respond with ONLY a single JSON object and nothing else — no markdown code fence, no explanation:
{"transcript": "<the transcribed text, with any guessed word wrapped like {this}, or \\"\\" if blank; see the split rule above when continuesPrevious is true>", "dateHeader": "<standardized as above, e.g. \\"18 October YYYY\\", or null if this page has no date header of its own>", "continuesPrevious": <true only if this page ALSO shows the tail end of a PREVIOUS day's entry before a new date header starts further down the SAME page, else false>, "previousPart": "<only when continuesPrevious is true: the text BEFORE the new date header, or null>"}`;

/** Defensive parse: strips a markdown fence if the model added one anyway, extracts the
 *  outermost {...}, and never throws — an unparseable reply degrades to "blank page, no
 *  date" rather than crashing the whole batch (see processRawBatch's "never drop a page"
 *  principle). Exported separately so this risky bit is unit-testable without Tauri. */
export function parseDescribeResponse(raw: string): PageDescription {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
      dateHeader: typeof parsed.dateHeader === "string" && parsed.dateHeader.trim() ? parsed.dateHeader.trim() : null,
      continuesPrevious: parsed.continuesPrevious === true,
      previousPart: typeof parsed.previousPart === "string" && parsed.previousPart ? parsed.previousPart : undefined,
    };
  } catch {
    log.error("raw", "describe.parse-error", { raw: raw.slice(0, 300) });
    return { transcript: "", dateHeader: null };
  }
}

export async function describePageViaClaude(_ref: string, absolutePath: string): Promise<PageDescription> {
  const raw = await invoke<string>("describe_journal_page", {
    imagePath: absolutePath,
    prompt: PROMPT_TEMPLATE(absolutePath),
  });
  return parseDescribeResponse(raw);
}
