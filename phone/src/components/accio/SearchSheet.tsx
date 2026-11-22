// SearchSheet.tsx — the Accio result list: one flat list, best match first, poured UP from
// the summon bar / dock so the best match sits nearest the thumb (design/search-results.md).
//
// It replaces the reel for as long as a query is typed OR held (keyboard down) — the reel
// only comes back when the search is cleared. The order is the search's (rankSearch); this
// view never sorts, it only reverses for bottom-anchoring. With nothing typed it shows no
// rows at all (the recents chips are the whole offer), and the reel stays dimmed behind.

import { useEffect, useRef } from "react";
import type { Note } from "../../types";
import { SearchResultRow } from "./SearchResultRow";

const MAX_ROWS = 30;

export function SearchSheet({
  list,
  asked,
  queryText,
  onOpen,
  fetchingId = null,
}: {
  /** Best-first. */
  list: Note[];
  /** A query is in (typed or held) — an empty list then means "no results". */
  asked: boolean;
  queryText: string;
  onOpen: (n: Note) => void;
  /** PHONE-WINDOW: the older memory currently being fetched, if any. */
  fetchingId?: string | null;
}) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const rows = list.slice(0, MAX_ROWS);

  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    el.classList.remove("overflowing"); // measure clean, then fade only if it scrolls
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => {
      el.classList.toggle("overflowing", el.scrollHeight > el.clientHeight + 4);
    });
    return () => cancelAnimationFrame(raf);
  }, [list]);

  return (
    <div className={"search-sheet" + (asked ? " asked" : "")} data-n={String(list.length)}>
      <div
        className="search-results"
        ref={resultsRef}
        role={asked ? "region" : undefined}
        aria-label={asked ? `Search results, ${list.length}` : undefined}
      >
        {!asked ? null : list.length === 0 ? (
          <div className="sr-empty" role="status">
            Nothing answered the summons.
          </div>
        ) : (
          // strongest match nearest the thumb → render it LAST (bottom)
          rows
            .slice()
            .reverse()
            .map((n) => (
              <SearchResultRow key={n.id} note={n} queryText={queryText} onOpen={onOpen} fetching={n.id === fetchingId} />
            ))
        )}
      </div>
    </div>
  );
}
