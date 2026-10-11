// SearchResultRow.tsx — one row in the Accio "pour-up" sheet.
//
// Source markup ~1374-1379. Dense row: flask + title/snippet + when. The strongest
// match is rendered LAST (nearest the thumb) and lit via .sr:last-child (CSS).

import type { Note } from "../../types";
import { highlight } from "../../highlight";
import { Flask } from "../Flask";

export function SearchResultRow({ note, queryText, onOpen }: { note: Note; queryText: string; onOpen: (n: Note) => void }) {
  return (
    <div className="sr" data-id={note.id} onClick={() => onOpen(note)}>
      <Flask shape={note.shape} cat={note.cat} fill={note.fill} />
      <div className="body">
        <div className="title">{highlight(note.t || "New thought", queryText)}</div>
        <div className="snip">{highlight(note.c || "…", queryText)}</div>
      </div>
      <div className="when">{note.created || note.d}</div>
    </div>
  );
}
