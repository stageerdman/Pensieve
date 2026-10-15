// PhoneCollection.tsx — the full-screen "saved collection" (Pinterest board) view. Opened by
// tapping a gallery's composite cover; shows every photo in a vertical MASONRY scroll (CSS
// multi-column — images keep their ratio, no layout math). Close at the top (X), swipe the sheet
// down, or Esc. Tapping a photo opens the single-photo lightbox ON TOP. When the note is editable
// each photo has a quiet × to remove it (persisted back to the gallery block via the controller).

import { useEffect, useRef, useState } from "react";
import { phoneCollection, type CollectionState } from "../../lib/media/collectionController";
import { phoneLightbox } from "../../lib/media/lightboxController";
import { mediaAlt } from "../../lib/media/noteMedia";
import { haptic } from "../../util";

export function PhoneCollection() {
  const [s, setS] = useState<CollectionState>(phoneCollection.get());
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => phoneCollection.subscribe(setS), []);
  useEffect(() => {
    if (s.open) haptic(8);
  }, [s.open]);

  // Esc closes.
  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") phoneCollection.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.open]);

  if (!s.open) return null;

  // Swipe the whole sheet DOWN past a threshold to dismiss (decided-vertical, like the lightbox);
  // only engages from the header grabber so it never fights the masonry's vertical scroll.
  const drag = { y0: 0, active: false };
  const onGrabDown = (e: React.PointerEvent) => {
    drag.y0 = e.clientY;
    drag.active = true;
  };
  const onGrabMove = (e: React.PointerEvent) => {
    if (!drag.active) return;
    const dy = Math.max(0, e.clientY - drag.y0);
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transform = `translateY(${dy}px)`;
      sheet.style.opacity = String(Math.max(0.3, 1 - dy / 600));
    }
  };
  const onGrabUp = (e: React.PointerEvent) => {
    if (!drag.active) return;
    drag.active = false;
    const dy = e.clientY - drag.y0;
    const sheet = sheetRef.current;
    if (dy > 120) {
      phoneCollection.close();
      return;
    }
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.opacity = "";
    }
  };

  return (
    <div className="ph-collection" role="dialog" aria-modal="true" aria-label="Photo collection" ref={sheetRef}>
      <div
        className="ph-collection-top"
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <span className="ph-collection-grabber" aria-hidden="true" />
        <span className="ph-collection-count">{s.items.length} photos</span>
        <button className="ph-collection-close" aria-label="Close" onClick={() => phoneCollection.close()}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="ph-collection-masonry">
        {s.items.map((it, i) => (
          <div className="ph-collection-tile" key={`${i}-${it.url}`}>
            <img
              src={it.url}
              alt={mediaAlt(it.caption)}
              draggable={false}
              onClick={() => phoneLightbox.open(s.items, i)}
            />
            {it.caption ? <div className="ph-collection-caption">{it.caption}</div> : null}
            {s.editable ? (
              <button
                className="ph-collection-remove"
                aria-label="Remove photo"
                onClick={(e) => {
                  e.stopPropagation();
                  phoneCollection.remove(i);
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
