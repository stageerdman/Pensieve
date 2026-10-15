// collectionController.ts — the full-screen "saved collection" view (Pinterest board). A gallery
// renders as a small composite COVER; tapping it opens this overlay: all the board's photos in a
// vertical masonry scroll. Like the lightbox, it's a module-level pub/sub so the imperatively-built
// cover (outside React, in components/note/mediaDom.ts) can summon the React <PhoneCollection/>
// mounted at the app root. Tapping a photo inside opens the existing single-photo lightbox on top.

import type { LightboxItem } from "./lightboxController";

export interface CollectionState {
  open: boolean;
  items: LightboxItem[]; // resolved url + caption, in gallery order
  editable: boolean;
  onRemove?: (index: number) => void; // persist a removal back to the gallery block (mediaDom)
}

type Listener = (s: CollectionState) => void;

let state: CollectionState = { open: false, items: [], editable: false };
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(state));

export const phoneCollection = {
  open(items: LightboxItem[], opts: { editable?: boolean; onRemove?: (index: number) => void } = {}) {
    if (!items.length) return;
    state = { open: true, items, editable: !!opts.editable, onRemove: opts.onRemove };
    emit();
  },
  close() {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
  },
  /** Remove photo `index`: persist via the stored onRemove, drop it from the view, and close the
   *  collection if fewer than two remain (the gallery has collapsed to a single image). */
  remove(index: number) {
    state.onRemove?.(index);
    const items = state.items.filter((_, i) => i !== index);
    if (items.length < 2) {
      state = { ...state, open: false };
    } else {
      state = { ...state, items };
    }
    emit();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  get(): CollectionState {
    return state;
  },
};
