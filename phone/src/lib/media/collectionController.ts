// collectionController.ts — the full-screen "saved collection" view (Pinterest board). A gallery
// renders as a small composite COVER; tapping it opens this overlay: all the board's photos in a
// vertical masonry scroll. Like the lightbox, it's a module-level pub/sub so the imperatively-built
// cover (outside React, in components/note/mediaDom.ts) can summon the React <PhoneCollection/>
// mounted at the app root. Tapping a photo inside opens the existing single-photo lightbox on top.

import type { LightboxItem } from "./lightboxController";

export interface CollectionState {
  open: boolean;
  items: LightboxItem[]; // resolved url + caption, in gallery order
  editable: boolean; // the note PERMITS edits (set at open) — gates whether the Edit spell does anything
  editMode: boolean; // affordances are ON now (×, pull-out, drag handles). Default false → clean view.
  onRemove?: (index: number) => void; // persist a removal back to the gallery block (mediaDom)
  onReorder?: (from: number, to: number) => void; // persist a drag-reorder back to the gallery block
  // Pull photo `index` OUT of the gallery into the note as a standalone image under the gallery.
  onPullOut?: (index: number) => void;
  // Add freshly-picked photos to the gallery; returns the refreshed resolved items (or void).
  onAdd?: (images: { ref: string }[]) => Promise<LightboxItem[]> | LightboxItem[] | void;
}

type Listener = (s: CollectionState) => void;

let state: CollectionState = { open: false, items: [], editable: false, editMode: false };
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(state));

export const phoneCollection = {
  open(
    items: LightboxItem[],
    opts: {
      editable?: boolean;
      onRemove?: (index: number) => void;
      onReorder?: (from: number, to: number) => void;
      onPullOut?: (index: number) => void;
      onAdd?: CollectionState["onAdd"];
    } = {},
  ) {
    if (!items.length) return;
    state = {
      open: true,
      items,
      editable: !!opts.editable,
      editMode: false, // always open clean — the Edit spell turns affordances on
      onRemove: opts.onRemove,
      onReorder: opts.onReorder,
      onPullOut: opts.onPullOut,
      onAdd: opts.onAdd,
    };
    emit();
  },
  /** Toggle edit mode (the Edit spell). No-op when the note doesn't permit edits. */
  toggleEditMode() {
    if (!state.open || !state.editable) return;
    state = { ...state, editMode: !state.editMode };
    emit();
  },
  /** Leave edit mode (e.g. tapping the board background). */
  exitEditMode() {
    if (!state.open || !state.editMode) return;
    state = { ...state, editMode: false };
    emit();
  },
  /** Commit a drag-reorder: move items[from] → items[to] in view, then persist via onReorder. */
  reorder(from: number, to: number) {
    if (!state.open || from === to) return;
    const items = state.items.slice();
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    state = { ...state, items };
    state.onReorder?.(from, to);
    emit();
  },
  /** Add picked photos (already minted refs) to the open board; refresh the view from the result. */
  async addFiles(images: { ref: string }[]) {
    if (!state.open || !state.onAdd || !images.length) return;
    const next = await state.onAdd(images);
    if (next && next.length) {
      state = { ...state, items: next };
      emit();
    }
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
  /** Pull photo `index` OUT of the gallery into the note (persist via onPullOut), then drop it from
   *  the view. Same <2-left collapse rule as remove — the board closes and you land back on the
   *  memory seeing the gallery and the pulled-out image as its own block. */
  pullOut(index: number) {
    state.onPullOut?.(index);
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
