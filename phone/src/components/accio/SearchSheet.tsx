// SearchSheet.tsx — the "searching" presentation: results pour UP from the summon bar,
// best match nearest the thumb.
//
// Source markup ~510, render ~1381-1393. A scrim dims the dormant reel/lens behind;
// the results stack is anchored just above the bar. SAME single query as the reel
// (HARD constraint #5) — this is the reel's data re-presented for thumb-scanning,
// alive only while .searching. Strongest match is rendered LAST (bottom) and the list
// is scrolled to the bottom; the top fade is applied only when it actually overflows.

import { useEffect, useRef } from "react";
import type { Note } from "../../types";
import { SearchResultRow } from "./SearchResultRow";

export function SearchSheet({ list, queryText, onOpen }: { list: Note[]; queryText: string; onOpen: (n: Note) => void }) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const rows = list.slice(0, 30); // natural order; reversed below so best match sits last

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
    <div className="search-sheet" data-n={String(list.length)}>
      <div className="search-results" ref={resultsRef}>
        {list.length === 0 ? (
          <div className="sr-empty">Nothing answered the summons.</div>
        ) : (
          // strongest match nearest the bar → render it LAST (bottom)
          rows
            .slice()
            .reverse()
            .map((n) => <SearchResultRow key={n.id} note={n} queryText={queryText} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}
