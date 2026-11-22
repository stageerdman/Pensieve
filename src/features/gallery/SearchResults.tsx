import { useEffect, useRef, useState } from "react";
import type { NoteMeta } from "../../lib/types";
import type { SearchResult } from "../../lib/search/search";
import type { TranscriptJump } from "../../hooks/useTranscriptHits";
import { SearchResultRow } from "./SearchResultRow";
import { TranscriptJumpLines } from "./TranscriptJumpLines";
import type { MenuAnchor, PeekTarget } from "./FlaskCard";

// While searching, the timeline gives way to ONE flat list, best match first
// (design/search-results.md). The order comes from the search itself — this view never
// sorts. 50 rows are mounted at first; 50 more join whenever the end comes near (no button).

export const PAGE = 50;
const LOAD_MARGIN = "0px 0px 150% 0px";

export interface SearchResultsProps {
  /** Already ordered best-first by the search. */
  notes: NoteMeta[];
  match?: Map<string, SearchResult>;
  transcriptJumps?: Map<string, TranscriptJump[]>;
  queryText: string;
  now: number;
  rootRef: React.RefObject<HTMLElement>;
  onOpen: (id: string, background: boolean) => void;
  onJump: (id: string, jump: TranscriptJump) => void;
  onContextMenu: (e: MenuAnchor, id: string) => void;
  onHoverChange: (target: PeekTarget | null) => void;
  onPeekToggle: (target: PeekTarget) => void;
  onToggleWorkingSet: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

export function SearchResults({
  notes,
  match,
  transcriptJumps,
  queryText,
  now,
  rootRef,
  onOpen,
  onJump,
  ...rowActions
}: SearchResultsProps) {
  const supported = typeof IntersectionObserver !== "undefined";
  const [limit, setLimit] = useState(PAGE);

  // A new answer (the match map changes per query) starts over at 50 — reset during render
  // so the old, longer list never flashes.
  const lastMatch = useRef(match);
  if (lastMatch.current !== match) {
    lastMatch.current = match;
    if (limit !== PAGE) setLimit(PAGE);
  }

  const shown = supported ? notes.slice(0, limit) : notes;
  const more = shown.length < notes.length;

  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!supported || !sentinel || !more) return;
    // Recreated per page, so a sentinel still in range after a load fires again.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
      },
      { root: rootRef.current, rootMargin: LOAD_MARGIN },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [supported, sentinel, more, limit, rootRef]);

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <ul role="list" aria-label={`Search results, ${notes.length}`} className="flex flex-col gap-0.5">
        {shown.map((n) => {
          const jumps = transcriptJumps?.get(n.id);
          return (
            <li key={n.id}>
              <SearchResultRow
                note={n}
                match={match?.get(n.id)}
                queryText={queryText}
                now={now}
                onOpen={onOpen}
                {...rowActions}
              />
              {jumps && jumps.length > 0 && (
                <div className="pl-14 pr-3">
                  <TranscriptJumpLines jumps={jumps} onJump={(j) => onJump(n.id, j)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {more && <div ref={setSentinel} aria-hidden className="h-px" />}
    </div>
  );
}
