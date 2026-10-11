// Reel.tsx — the home list: small uniform cards scrolling under the fixed loupe.
//
// Source markup ~463. The ONE scroller (.reel) holds a track of .slot cards. The
// useReelFisheye hook owns scroll → magnification; this component only renders the
// current VIEW (the single filtered/ranked data source, HARD constraint #5). On an
// empty VIEW the cards vanish and the Glass shows the empty message.

import type { Note } from "../../types";
import { ReelCard } from "./ReelCard";

export function Reel({
  view,
  queryText,
  onOpen,
  reelRef,
  trackRef,
}: {
  view: Note[];
  queryText: string;
  onOpen: (n: Note) => void;
  reelRef: React.RefObject<HTMLDivElement>;
  trackRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="reel" ref={reelRef}>
      <div className="reel-track" ref={trackRef}>
        {view.map((n) => (
          <ReelCard key={n.id} note={n} queryText={queryText} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
