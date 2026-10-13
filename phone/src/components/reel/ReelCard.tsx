// ReelCard.tsx — one memory in the reel (a .slot wrapping a .card).
//
// Source markup ~698-701. The .slot is the rigid 84px grid box; the .card inside is
// what the loupe deforms per-frame (useReelFisheye mutates its transform/opacity/--m
// directly — React never re-renders it mid-animation). The snippet is absolutely
// positioned and blooms in only near the focal line.

import type { Note } from "../../types";
import { highlight } from "../../highlight";
import { Flask } from "../Flask";

export function ReelCard({ note, queryText, onOpen }: { note: Note; queryText: string; onOpen: (n: Note) => void }) {
  return (
    <div className="slot" data-id={note.id}>
      <div className="card" onClick={() => onOpen(note)}>
        <Flask shape={note.shape} cat={note.cat} fill={note.fill} />
        {/* title + meta + snippet are ONE column, vertically centred in the row (the card
            is align-items:center) so the focal card's text stays centred in the glass no
            matter how many snippet lines wrap. The snippet collapses to 0 height off-focus
            (max-height driven by the loupe's reveal) so resting rows stay compact. */}
        <div className="body">
          <div className="title">{highlight(note.t || "New thought", queryText)}</div>
          <div className="meta">{note.created || note.d}</div>
          <div className="snippet">{highlight(note.c || "…", queryText)}</div>
        </div>
      </div>
    </div>
  );
}
