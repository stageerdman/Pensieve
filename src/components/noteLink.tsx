import { createReactInlineContentSpec } from "@blocknote/react";
import type { NoteMeta } from "../lib/types";
import { FlaskFor } from "./Flask";

// A note link — a custom inline atom inserted via the "@" menu. It references
// another note by id and renders its flask + title; clicking it opens that note.
// Because the render lives at module scope (outside React), the "open" action and
// the note lookup are wired in through small handlers the Editor sets on mount.

let openHandler: ((noteId: string) => void) | null = null;
export const setNoteLinkOpen = (h: (noteId: string) => void) => {
  openHandler = h;
};

// Resolves a note id to its metadata (for the flask icon + fill). Kept current by
// the Editor so a link shows the referenced note's live flask.
let resolveNote: ((noteId: string) => NoteMeta | undefined) | null = null;
export const setNoteLinkResolve = (r: (noteId: string) => NoteMeta | undefined) => {
  resolveNote = r;
};

export const NoteLink = createReactInlineContentSpec(
  {
    type: "noteLink",
    propSchema: {
      noteId: { default: "" },
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const { noteId, title } = inlineContent.props as { noteId: string; title: string };
      const note = noteId ? resolveNote?.(noteId) : undefined;
      return (
        <span
          className="note-link"
          contentEditable={false}
          onClick={() => noteId && openHandler?.(noteId)}
        >
          <FlaskFor icon={note?.icon} chars={note?.chars} size={13} className="note-link-flask" />
          {title || "Untitled"}
        </span>
      );
    },
  },
);
