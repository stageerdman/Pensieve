import { forwardRef, type ReactNode } from "react";
import { MediaRune } from "./MediaRune";
import { frameAspect } from "./mediaShape";
import { mediaAlt, type MediaBackupState } from "../../../lib/media";

// The shared visual base for ALL inline media (design.md names it "MediaBlock").
// A single image is one MediaBlock; a gallery reuses its CSS language; the phone image is
// the same family. Token-driven and identical across surfaces — the sameness IS the family,
// so no surface grows a second radius, shadow, or ring colour.
//
// Purely visual: it renders the frame, the states (incl. the EMPTY add-an-image placeholder),
// the caption slot and the backup rune. All interaction (resize, popover, ⋯ menu, keyboard)
// lives in the composing block (ImageBlock) via the overlay/placeholder/caption slots.

/** States (wiki "States matrix — absence = healthy"). `empty` = the add-an-image placeholder;
 *  every state is quiet and non-blocking (no spinners, no success tick, never collapse). */
export type MediaState = "empty" | "loading" | "saving" | "loaded" | "broken";

export interface MediaBlockProps {
  /** A loadable URL (Tauri asset / browser blob / external). Absent while empty/loading/broken. */
  url?: string | null;
  /** Alt text for the <img> (= the caption). */
  alt: string;
  /** Display width as a fraction of the text column (0..1). */
  width: number;
  /** Box shape (width/height); 0 = natural — the image's own, or a default for the placeholder. */
  aspect?: number;
  state: MediaState;
  /** CSS `object-position` for the <img> (e.g. "30% 70%") — repositions a cropped (cover) image. */
  objectPosition?: string;
  /** Shown in the broken/missing state so the ref is never silent. */
  filename?: string;
  selected?: boolean;
  /** Keyboard focus adds the accent-glow halo — the only glow a MediaBlock gets. */
  focused?: boolean;
  onImgLoad?: () => void;
  onImgError?: () => void;
  /** Broken state: re-point the ref to a file on disk. */
  onLocate?: () => void;
  /** Expand to the lightbox — bound to DOUBLE-click (a single click just selects the block,
   *  so the resize handle / caption / popover stay reachable). */
  onActivate?: () => void;
  /** Affordances drawn INSIDE the frame (resize handles, ⋯/tools, the add popover). */
  overlay?: ReactNode;
  /** The add-an-image placeholder content, rendered when state === "empty". */
  placeholder?: ReactNode;
  /** The caption slot BELOW the frame — editable input (selected) or static text. */
  caption?: ReactNode;
  /** OneDrive backup state → the gold rune bottom-right. Absent / "backed-up" → no rune. */
  backup?: MediaBackupState;
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
  { url, alt, width, aspect, objectPosition, state, filename, selected, focused, onImgLoad, onImgError, onLocate, onActivate, overlay, placeholder, caption, backup },
  ref,
) {
  const broken = state === "broken";
  const empty = state === "empty";
  const showImg = !broken && !empty && !!url && (state === "loaded" || state === "saving");
  const pct = `${Math.round(width * 100)}%`;
  // A "shaped" box (explicit aspect, or the empty placeholder) needs a definite width +
  // aspect-ratio; a natural loaded image shrink-wraps to its own size (width:fit-content).
  const shaped = empty || !!(aspect && aspect > 0);
  const ratio = frameAspect(aspect, showImg);

  return (
    <div
      ref={ref}
      className={
        "pensieve-media" +
        (selected ? " is-selected" : "") +
        (focused ? " is-focused" : "") +
        (shaped ? " is-shaped" : "")
      }
      // Natural: width is a MAX, the frame shrink-wraps (no letterbox). Shaped: a concrete
      // width + an aspect-ratio on the frame, so even an empty box has a real size.
      style={shaped ? { width: pct, maxWidth: "100%" } : { maxWidth: pct }}
      data-state={state}
    >
      <div
        className={"pensieve-media-frame" + (shaped ? " is-shaped" : "")}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        onDoubleClick={onActivate && showImg ? () => onActivate() : undefined}
      >
        {showImg && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={url!} alt={mediaAlt(alt)} className="pensieve-media-img" style={objectPosition ? { objectPosition } : undefined} onLoad={onImgLoad} onError={onImgError} draggable={false} />
        )}
        {empty && <div className="pensieve-media-placeholder">{placeholder}</div>}
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
        {backup && !broken && !empty && <MediaRune state={backup} />}
      </div>
      {caption}
    </div>
  );
});
