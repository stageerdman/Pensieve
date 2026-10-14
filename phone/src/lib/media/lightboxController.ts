// lightboxController.ts — a module-level pub/sub so an imperatively-built media block (a
// carousel / single image, created outside the React tree in components/note/mediaDom.ts)
// can summon the full-screen lightbox. Mirrors the desktop src/components/media/
// lightboxController.ts pattern (a module seam, not React context, because the caller is
// outside React). One <PhoneLightbox/> mounted at the app root subscribes and renders.

export interface LightboxItem {
  url: string;
  caption?: string;
}

export interface LightboxState {
  open: boolean;
  items: LightboxItem[];
  index: number;
}

type Listener = (s: LightboxState) => void;

let state: LightboxState = { open: false, items: [], index: 0 };
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(state);
}

export const phoneLightbox = {
  open(items: LightboxItem[], index = 0) {
    if (!items.length) return;
    state = { open: true, items, index: Math.max(0, Math.min(index, items.length - 1)) };
    emit();
  },
  close() {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  get(): LightboxState {
    return state;
  },
};
