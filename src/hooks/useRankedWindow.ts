import { useEffect, useRef, useState } from "react";

// How many ranked search results to mount: one page, plus another each time a sentinel after
// the last card comes within ~1.5 screens. A relevance list is read top-down, so a count is
// the right window (the date cutoff the home timeline uses would hide an old top hit).
// Without IntersectionObserver (tests) it shows everything.

export const RANKED_PAGE = 48;
const LOAD_MARGIN = "0px 0px 150% 0px";

export function useRankedWindow(total: number, resetKey: unknown, rootRef: React.RefObject<HTMLElement>) {
  const supported = typeof IntersectionObserver !== "undefined";
  const [limit, setLimit] = useState(RANKED_PAGE);

  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) {
    // Reset during render so a new query never flashes the old window.
    lastReset.current = resetKey;
    if (limit !== RANKED_PAGE) setLimit(RANKED_PAGE);
  }

  const shown = supported ? Math.min(limit, total) : total;
  const hasMore = shown < total;

  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!supported || !sentinel || !hasMore) return;
    // Recreated as the limit grows, so a sentinel still in range fires again.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + RANKED_PAGE);
      },
      { root: rootRef.current, rootMargin: LOAD_MARGIN },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [supported, sentinel, hasMore, shown, rootRef]);

  return { shown, hasMore, sentinelRef: setSentinel };
}
