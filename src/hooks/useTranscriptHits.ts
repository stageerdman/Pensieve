import { useEffect, useState } from "react";
import type { NoteMeta } from "../lib/types";
import type { SearchResult } from "../lib/search/search";
import { getStore } from "../lib/store";
import { extractMediaRefs } from "../lib/media/ref";
import { queryTerms } from "../lib/search/tokenize";
import { transcriptHits, type TranscriptHit } from "../lib/transcripts/transcriptMatches";
import type { Transcript } from "../lib/transcripts/types";

// Only recordings carry transcripts — skip image refs so we don't do a sidecar read per photo.
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|webm|ogg|flac)$/i;

// Accio transcript-hit jump-lines: for each result that matched in its (folded) BODY, find
// WHERE in a recording the query was spoken, so the gallery can show timecoded jumps that
// open the transcript split at that moment. A result only knows "matched in body" — the
// body is the markdown + folded transcript text — so we recompute here by loading the note's
// transcripts and matching the same way the index did (transcriptHits mirrors indexer.ts).
//
// Scoped to the few `where === "text"` notes, loaded lazily off the main search path, so the
// cheap gallery grid stays cheap. Returns noteId → jumps (empty until resolved / when idle).

export interface TranscriptJump extends TranscriptHit {
  ref: string; // the audio media ref (→ resolveMediaUrl → split src)
  transcript: Transcript; // shared object, carried so the jump can open the split
}

export function useTranscriptHits(
  results: NoteMeta[],
  match: Map<string, SearchResult> | undefined,
  queryText: string,
): Map<string, TranscriptJump[]> {
  const [hits, setHits] = useState<Map<string, TranscriptJump[]>>(new Map());

  useEffect(() => {
    const terms = queryTerms(queryText);
    const candidates = terms.length && match ? results.filter((n) => match.get(n.id)?.where === "text") : [];
    if (candidates.length === 0) {
      setHits((prev) => (prev.size ? new Map() : prev));
      return;
    }
    let cancelled = false;
    void (async () => {
      const store = getStore();
      const out = new Map<string, TranscriptJump[]>();
      for (const n of candidates) {
        const note = await store.load(n.id);
        if (cancelled) return;
        if (!note) continue;
        const jumps: TranscriptJump[] = [];
        for (const ref of extractMediaRefs(note.markdown)) {
          if (!AUDIO_EXT.test(ref)) continue; // photos don't have transcripts
          const t = await store.loadTranscript(ref); // null if no sidecar yet — skipped
          if (cancelled) return;
          if (!t) continue;
          for (const h of transcriptHits(t, terms)) jumps.push({ ...h, ref, transcript: t });
        }
        if (jumps.length) out.set(n.id, jumps);
      }
      if (!cancelled) setHits(out);
    })();
    return () => { cancelled = true; };
  }, [results, match, queryText]);

  return hits;
}
