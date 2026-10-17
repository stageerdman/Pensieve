import type { Transcript } from "./types";
import { tokenize } from "../search/tokenize";

// Find every spoken moment in a transcript that matches the search terms, so Accio can show
// timecoded "jump-lines" under a result. Matching MIRRORS the index exactly (indexer.ts): a
// word matches a term when one of its tokens CONTAINS that term as a substring (so "prob"
// hits "problém", "walk" hits "walking") — otherwise the jumps wouldn't line up with the
// notes the search actually surfaced. A word matching ANY term is a hit.
//
// Word-level when the segment carries word timings (jump to word.s); else segment-level
// (jump to seg.start, snippet = the segment text). Pure + synchronous → unit-testable.

export interface TranscriptHit {
  /** Seconds to seek the recording to. */
  time: number;
  speaker: string | null;
  /** Short context window of plain text around the match, ellipsed at the edges. */
  snippet: string;
}

interface Opts {
  /** Max hits returned (keeps a result row from ballooning). Default 8. */
  max?: number;
  /** Context words kept on each side of a word match. Default 6. */
  radius?: number;
}

function tokenHasTerm(text: string, terms: string[]): boolean {
  const toks = tokenize(text);
  return toks.some((tok) => terms.some((term) => tok.includes(term)));
}

export function transcriptHits(t: Transcript, terms: string[], opts: Opts = {}): TranscriptHit[] {
  const max = opts.max ?? 8;
  const radius = opts.radius ?? 6;
  const clean = terms.filter(Boolean);
  if (clean.length === 0) return [];

  const out: TranscriptHit[] = [];
  for (const seg of t.segments) {
    const ws = seg.words ?? [];
    if (ws.length > 0) {
      for (let wi = 0; wi < ws.length; wi++) {
        if (!tokenHasTerm(ws[wi].w, clean)) continue;
        const a = Math.max(0, wi - radius);
        const b = Math.min(ws.length, wi + radius + 1);
        const ctx = ws.slice(a, b).map((x) => x.w).join(" ");
        out.push({
          time: ws[wi].s,
          speaker: seg.speaker,
          snippet: (a > 0 ? "… " : "") + ctx + (b < ws.length ? " …" : ""),
        });
        if (out.length >= max) return out;
      }
    } else if (tokenHasTerm(seg.text, clean)) {
      out.push({ time: seg.start, speaker: seg.speaker, snippet: seg.text.trim() });
      if (out.length >= max) return out;
    }
  }
  return out;
}
