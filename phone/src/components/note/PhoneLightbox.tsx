// PhoneLightbox.tsx — the full-screen image viewer (the one magical moment on phone).
//
// Dimmed, blurred backdrop over everything; the image(s) sit in a horizontal scroll-snap
// track so a swipe left/right steps between gallery members (page dots echo the position).
// Dismiss: tap the backdrop, or swipe the image DOWN past a threshold. Pinch-zoom is the OS
// gesture (we don't fight it). Matches the token/visual language of the desktop ImageLightbox
// without importing its desktop-CSS-bound component.

import { useEffect, useRef, useState } from "react";
import { phoneLightbox, type LightboxState } from "../../lib/media/lightboxController";
import { haptic } from "../../util";

export function PhoneLightbox() {
  const [s, setS] = useState<LightboxState>(phoneLightbox.get());
  const trackRef = useRef<HTMLDivElement>(null);
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => phoneLightbox.subscribe(setS), []);

  // center the opened index once the track is laid out
  useEffect(() => {
    if (!s.open) return;
    setDotIndex(s.index);
    const track = trackRef.current;
    if (track) requestAnimationFrame(() => (track.scrollLeft = s.index * track.clientWidth));
    haptic(8);
  }, [s.open, s.index]);

  // Esc closes (keyboard / external keyboard)
  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") phoneLightbox.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.open]);

  if (!s.open) return null;

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setDotIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  // swipe-DOWN to dismiss: track vertical travel per frame on the image layer only. A mostly
  // vertical drag past the threshold closes; a mostly horizontal one is left to scroll-snap.
  const drag = { y0: 0, x0: 0, active: false, decided: false, vertical: false };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.y0 = e.clientY;
    drag.x0 = e.clientX;
    drag.active = true;
    drag.decided = false;
    drag.vertical = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.active) return;
    const dy = e.clientY - drag.y0;
    const dx = e.clientX - drag.x0;
    if (!drag.decided && (Math.abs(dy) > 8 || Math.abs(dx) > 8)) {
      drag.decided = true;
      drag.vertical = Math.abs(dy) > Math.abs(dx);
    }
    if (drag.decided && drag.vertical && dy > 0) {
      const sheet = trackRef.current;
      if (sheet) {
        sheet.style.transform = `translateY(${dy}px)`;
        sheet.style.opacity = String(Math.max(0.2, 1 - dy / 500));
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.active) return;
    drag.active = false;
    const dy = e.clientY - drag.y0;
    const sheet = trackRef.current;
    if (drag.vertical && dy > 110) {
      phoneLightbox.close();
      return;
    }
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.opacity = "";
    }
  };

  return (
    <div
      className="ph-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) phoneLightbox.close();
      }}
    >
      <button className="ph-lightbox-close" aria-label="Close" onClick={() => phoneLightbox.close()}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div
        className="ph-lightbox-track"
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {s.items.map((it, i) => (
          <figure className="ph-lightbox-frame" key={i}>
            <img src={it.url} alt={it.caption ?? ""} draggable={false} />
            {it.caption ? <figcaption>{it.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
      {s.items.length > 1 ? (
        <div className="ph-lightbox-dots" aria-hidden="true">
          {s.items.map((_, i) => (
            <span key={i} className={i === dotIndex ? "on" : ""} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
