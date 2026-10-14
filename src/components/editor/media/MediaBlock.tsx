import { forwardRef, type ReactNode } from "react";

// The shared visual base for ALL inline media (design.md names it "MediaBlock").
// A single image is one MediaBlock; a gallery (Phase 3) is MediaBlocks sharing one
// frame; the phone image (Phase 4) is the same MediaBlock in a narrower column. The
// sameness IS the family — everything here is token-driven and identical across the
// three, so no surface grows a second radius, shadow, or ring colour.
//
// This component is PURELY visual: it renders the frame, the four states, and the
// caption slot. All interaction (resize drag, caption editing, keyboard) lives in the
// composing block (ImageBlock) and is passed in through the `overlay`/`caption` slots.

/** The states matrix (wiki "States matrix — absence = healthy"). Every state is quiet
 *  and non-blocking: no spinners, no success checkmarks, never collapse to nothing. */
export type MediaState = "loading" | "saving" | "loaded" | "broken";

export interface MediaBlockProps {
  /** A loadable URL (Tauri asset / browser blob / external). Absent while loading or broken. */
  url?: string | null;
  /** Alt text for the <img> (= the caption). */
  alt: string;
  /** Display width as a fraction of the text column (0.25 / 0.5 / 0.75 / 1). */
  width: number;
  state: MediaState;
  /** Shown in the broken/missing state so the ref is never silent. */
  filename?: string;
  selected?: boolean;
  /** Keyboard focus adds the accent-glow halo — the only glow a MediaBlock gets. */
  focused?: boolean;
  onImgLoad?: () => void;
  onImgError?: () => void;
  /** Broken state: re-point the ref to a file on disk. */
  onLocate?: () => void;
  /** Click / activate the image (expand hook — Phase 2 wires the lightbox). */
  onActivate?: () => void;
  /** Affordances drawn INSIDE the frame (e.g. the resize handle). */
  overlay?: ReactNode;
  /** The caption slot BELOW the frame — editable input (selected) or static text. */
  caption?: ReactNode;
}

// A muted "image" glyph for the broken/missing state (stroke, currentColor — matches icons.tsx).
function BrokenGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export const MediaBlock = forwardRef<HTMLDivElement, MediaBlockProps>(function MediaBlock(
  { url, alt, width, state, filename, selected, focused, onImgLoad, onImgError, onLocate, onActivate, overlay, caption },
  ref,
) {
  const broken = state === "broken";
  const showImg = !broken && !!url && (state === "loaded" || state === "saving");

  return (
    <div
      ref={ref}
      className={
        "pensieve-media" +
        (selected ? " is-selected" : "") +
        (focused ? " is-focused" : "")
      }
      style={{ width: `${Math.round(width * 100)}%` }}
      data-state={state}
    >
      <div
        className="pensieve-media-frame"
        onClick={onActivate ? () => onActivate() : undefined}
        role={onActivate && !broken ? "button" : undefined}
      >
        {showImg && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={url!} alt={alt} className="pensieve-media-img" onLoad={onImgLoad} onError={onImgError} draggable={false} />
        )}
        {state === "loading" && <div className="pensieve-media-shim" aria-hidden="true" />}
        {state === "saving" && <div className="pensieve-media-progress" aria-hidden="true" />}
        {broken && (
          <div className="pensieve-media-broken">
            <BrokenGlyph />
            <div className="pensieve-media-broken-text">
              <span>Image missing</span>
              {filename && <span className="pensieve-media-filename">{filename}</span>}
            </div>
            {onLocate && (
              <button type="button" className="pensieve-media-locate" onClick={onLocate}>
                Locate…
              </button>
            )}
          </div>
        )}
        {overlay}
      </div>
      {caption}
    </div>
  );
});
