// Module-level wiring for the image block, mirrored on noteLink.tsx. The custom block's
// render and the paste/drop ProseMirror plugin both live outside React's tree, so the
// Editor injects the current note id (for the media path) through this setter on mount.

import { lightbox } from "../../media/lightboxController";

let currentNoteId = "";
export const setMediaNoteId = (id: string) => {
  currentNoteId = id;
};
export const getMediaNoteId = (): string => currentNoteId;

// The editor's "expand" affordance (Space / Enter / click on an image) opens the shared
// lightbox. `focusEl` is the focusable host to return focus to on close; `rectEl` is the
// picture frame the rect→centre travel starts from (they differ — the host is full-width
// and focusable, the frame is the image box). Phase 3 will pass the whole gallery here.
export const expandImage = (
  url: string,
  alt: string,
  focusEl?: HTMLElement | null,
  rectEl?: HTMLElement | null,
): void => {
  if (!url) return;
  lightbox.open({
    items: [{ url, caption: alt || undefined }],
    index: 0,
    originRect: (rectEl ?? focusEl)?.getBoundingClientRect(),
    originElement: focusEl ?? null,
  });
};
