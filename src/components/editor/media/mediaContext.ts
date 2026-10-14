// Module-level wiring for the image block, mirrored on noteLink.tsx. The custom block's
// render and the paste/drop ProseMirror plugin both live outside React's tree, so the
// Editor injects the few things they need (the current note id for the media path, and
// the expand hook) through these setters on mount.

let currentNoteId = "";
export const setMediaNoteId = (id: string) => {
  currentNoteId = id;
};
export const getMediaNoteId = (): string => currentNoteId;

// Phase 2 wires the lightbox here; for Phase 1 it stays a no-op stub so the Space /
// click "expand" affordance is already present and keyboard-reachable.
let expandHandler: ((url: string, alt: string) => void) | null = null;
export const setImageExpand = (h: ((url: string, alt: string) => void) | null) => {
  expandHandler = h;
};
export const expandImage = (url: string, alt: string): void => {
  // TODO(Phase 2): open the shared lightbox (PreviewPortal) from here.
  expandHandler?.(url, alt);
};
