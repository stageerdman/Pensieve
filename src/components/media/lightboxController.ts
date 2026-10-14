// The shared image-lightbox opener — a tiny module-level pub/sub controller.
//
// WHY module-level (not React context): the opener must be callable from places that
// live OUTSIDE the React tree — a BlockNote custom-block render, the paste/drop
// ProseMirror plugin, and (later) the phone surface. A context would be unreachable
// from there. One `<ImageLightbox/>` is mounted once at the app root; it subscribes to
// this controller and renders the overlay. Anyone, anywhere, calls `lightbox.open(...)`.
//
// The API is shaped for one OR many images so Phase 3 (the gallery grid) passes a list
// with zero rework: a single image is just `items` of length 1 (arrows/counter hide).

export interface LightboxItem {
  /** A loadable URL (Tauri asset / browser blob / external). The lightbox only DISPLAYS
   *  this — it does not resolve refs (Phase 0 already resolved + registered the url). */
  url: string;
  caption?: string;
}

export interface LightboxOpenOptions {
  items: LightboxItem[];
  /** Which item to show first (clamped into range by the view). */
  index: number;
  /** The on-page rect of the originating thumbnail, for the rect→centre travel (FLIP).
   *  Absent → the overlay just cross-fades/scales in (no shared-element travel). */
  originRect?: DOMRect;
  /** The element to return focus to on close (focus restoration). Falls back to whatever
   *  was focused when `open` was called. */
  originElement?: HTMLElement | null;
}

type Listener = (open: LightboxOpenOptions | null) => void;

const listeners = new Set<Listener>();

export const lightbox = {
  /** Open (or re-open) the lightbox. Callable from anywhere — inside or outside React. */
  open(options: LightboxOpenOptions): void {
    const originElement =
      options.originElement ??
      (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);
    const payload: LightboxOpenOptions = { ...options, originElement };
    for (const fn of listeners) fn(payload);
  },
  /** Programmatic close (the view also closes itself on Esc / backdrop / close button). */
  close(): void {
    for (const fn of listeners) fn(null);
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
