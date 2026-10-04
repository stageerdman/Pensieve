import { createReactInlineContentSpec } from "@blocknote/react";

// A note link — a custom inline atom inserted via the "@" menu. It references
// another note by id and renders its title; clicking it opens that note. Because
// the render lives at module scope (outside React), the "open" action is wired in
// through a small handler the Editor sets on mount.

let openHandler: ((noteId: string) => void) | null = null;
export const setNoteLinkOpen = (h: (noteId: string) => void) => {
  openHandler = h;
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
      return (
        <span
          className="note-link"
          contentEditable={false}
          onClick={() => noteId && openHandler?.(noteId)}
        >
          @{title || "Untitled"}
        </span>
      );
    },
  },
);
