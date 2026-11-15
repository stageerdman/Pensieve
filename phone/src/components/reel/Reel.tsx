// Reel.tsx — the home list: small uniform cards scrolling under the fixed loupe.
//
// Source markup ~463. The ONE scroller (.reel) holds a track of .slot cards. The
// useReelFisheye hook owns scroll → magnification; this component only renders the
// current VIEW (the single filtered/ranked data source, HARD constraint #5). On an
// empty VIEW the cards vanish and the Glass shows the empty message.
//
// FAST-LOAD: the view is windowed by week (hooks/useFeedWindow) — only the newest weeks are
// rendered at rest, older ones load as you scroll near the end, and weeks scrolled far away for
// a few minutes become empty `.slot`s (same rigid height → no scroll jump, and the fisheye's
// slot index still equals the card index).

import type { Note } from "../../types";
import type { RawMemory } from "../../lib/media/rawMemoryStore";
import { ReelCard } from "./ReelCard";
import { RawMemoryCard } from "./RawMemoryCard";
import { useFeedWindow } from "../../hooks/useFeedWindow";

export function Reel({
  view,
  rawBatches,
  queryText,
  windowKey = "",
  onOpen,
  onOpenRaw,
  reelRef,
  trackRef,
}: {
  view: Note[];
  /** Raw Memory batches still on this phone — rendered as cards at the top of the SAME
   *  scrollable track as every other memory (not a fixed strip above it). */
  rawBatches?: RawMemory[];
  queryText: string;
  /** The full Accio query — a new one restarts the window at the newest week. */
  windowKey?: string;
  onOpen: (n: Note) => void;
  onOpenRaw?: (b: RawMemory) => void;
  reelRef: React.RefObject<HTMLDivElement>;
  trackRef: React.RefObject<HTMLDivElement>;
}) {
  const win = useFeedWindow(view, reelRef, rawBatches?.length ?? 0, windowKey);
  return (
    <div className="reel" ref={reelRef}>
      <div className="reel-track" ref={trackRef}>
        {rawBatches?.map((b) => <RawMemoryCard key={b.id} batch={b} onOpen={onOpenRaw!} />)}
        {view.slice(0, win.shown).map((n, i) =>
          win.mounted(i) ? (
            <ReelCard key={n.id} note={n} queryText={queryText} onOpen={onOpen} />
          ) : (
            <div key={n.id} className="slot" data-id={n.id} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}
