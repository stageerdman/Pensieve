// The real (Tauri-only) implementation of DescribePage — shells out to the logged-in
// `claude` CLI via the describe_journal_page command (src-tauri/src/ai_vision.rs). AI
// processing is desktop-only (CLAUDE.md), so this file is only ever imported behind an
// isTauri() check (see useProcessQueue.ts) — it has no browser fallback, intentionally.
import { invoke } from "@tauri-apps/api/core";
import type { PageDescription } from "./processRawBatch";
import { log } from "../logger";

const PROMPT_TEMPLATE = (absolutePath: string) => `Read the handwritten journal page image at this exact path: ${absolutePath}

Transcribe every legible word of handwriting on the page, in reading order. If a word is genuinely illegible, skip just that word rather than refusing — only leave the transcript empty if the page is truly blank.

Then look for a DATE HEADER the writer put on this page (e.g. "Nov 3", "November 3rd", "Mon Nov 3", a date in any format). A page normally has at most one NEW date header.

Respond with ONLY a single JSON object and nothing else — no markdown code fence, no explanation:
{"transcript": "<the transcribed text, or \\"\\" if blank>", "dateHeader": "<the date header exactly as written, or null if this page has no date header of its own>", "continuesPrevious": <true only if this page ALSO shows the tail end of a PREVIOUS day's entry before a new date header starts further down the SAME page, else false>}`;

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
