// Reel.tsx — the home list: small uniform cards scrolling under the fixed loupe.
//
// Source markup ~463. The ONE scroller (.reel) holds a track of .slot cards. The
// useReelFisheye hook owns scroll → magnification; this component only renders the
// current VIEW (the single filtered/ranked data source, HARD constraint #5). On an
// empty VIEW the cards vanish and the Glass shows the empty message.

import type { Note } from "../../types";
import type { RawMemory } from "../../lib/media/rawMemoryStore";
import { ReelCard } from "./ReelCard";
import { RawMemoryCard } from "./RawMemoryCard";

export function Reel({
  view,
  rawBatches,
  queryText,
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
  onOpen: (n: Note) => void;
  onOpenRaw?: (b: RawMemory) => void;
  reelRef: React.RefObject<HTMLDivElement>;
  trackRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="reel" ref={reelRef}>
      <div className="reel-track" ref={trackRef}>
        {rawBatches?.map((b) => <RawMemoryCard key={b.id} batch={b} onOpen={onOpenRaw!} />)}
        {view.map((n) => (
          <ReelCard key={n.id} note={n} queryText={queryText} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
