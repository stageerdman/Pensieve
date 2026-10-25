// PhoneLightbox.tsx — the full-screen image viewer (the one magical moment on phone).
//
// Dimmed, blurred backdrop over everything; the image(s) sit in a horizontal scroll-snap
// track so a swipe left/right steps between gallery members (page dots echo the position).
// Dismiss: tap the backdrop, or swipe the image DOWN past a threshold. Matches the token/
// visual language of the desktop ImageLightbox without importing its desktop-CSS-bound
// component.
//
// Zoom: the global viewport is pinned to `maximum-scale=1.0` (double-tap elsewhere in the
// app is the word-selection gesture — see useWordSelection — so native OS pinch-zoom can't be
// re-enabled without breaking that). We roll our own instead: pinch and double-tap scale the
// ACTIVE frame's <img> via a plain CSS transform, applied imperatively (same pattern as the
// swipe-down-to-dismiss below — no React re-render mid-gesture). Below 2x zoom a single finger
// still drives the existing swipe-to-next / swipe-down-to-dismiss; above 1x it pans instead.

import { useEffect, useRef, useState } from "react";
import { phoneLightbox, type LightboxState } from "../../lib/media/lightboxController";
import { mediaAlt } from "../../lib/media/noteMedia";
import { haptic } from "../../util";

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.2;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;

export function PhoneLightbox() {
  const [s, setS] = useState<LightboxState>(phoneLightbox.get());
  const trackRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
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

  // ── pinch/double-tap zoom state for the CURRENT frame only (a ref so a frame of pinch
  //  motion never triggers a React re-render — the transform is written straight to the DOM).
  const zoom = useRef({
    scale: 1,
    x: 0,
    y: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    pinchStartDist: 0,
    pinchStartScale: 1,
    pan: null as { startX: number; startY: number; baseX: number; baseY: number } | null,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
  }).current;

  const activeImg = () => imgRefs.current[dotIndex] ?? null;

  const applyZoom = (img: HTMLImageElement | null, animate: boolean) => {
    if (!img) return;
    img.style.transition = animate ? "transform 0.22s var(--ease)" : "none";
    img.style.transform = `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`;
  };

  const resetZoom = (animate: boolean) => {
    zoom.scale = 1;
    zoom.x = 0;
    zoom.y = 0;
    applyZoom(activeImg(), animate);
  };

  // Swiping to a different photo always resets zoom on the frame being left.
  useEffect(() => {
    resetZoom(false);
  }, [dotIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS: a passive React onPointerMove can't block native scroll — one stable non-passive
  // touchmove guard (same lesson as PhoneCollection) preventDefaults only while a pinch or a
  // zoomed-in pan actually owns the gesture.
  useEffect(() => {
    if (!s.open) return;
    const track = trackRef.current;
    if (!track) return;
    const onTouch = (e: TouchEvent) => {
      if (zoom.pointers.size >= 2 || zoom.pan) e.preventDefault();
    };
    track.addEventListener("touchmove", onTouch, { passive: false });
    return () => track.removeEventListener("touchmove", onTouch);
  }, [s.open]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Pinch (2 pointers) and pan-while-zoomed (1 pointer, scale>1) take priority over this and
  // over the native swipe-to-next scroll — see the class comment at the top of the file.
  const drag = { y0: 0, x0: 0, active: false, decided: false, vertical: false };

  const onPointerDown = (e: React.PointerEvent) => {
    zoom.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (zoom.pointers.size === 2) {
      const pts = Array.from(zoom.pointers.values());
      zoom.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoom.pinchStartScale = zoom.scale;
      zoom.pan = null;
      drag.active = false; // a pinch owns this gesture now, not the dismiss-swipe
      return;
    }
    if (zoom.pointers.size > 1) return; // a stray 3rd finger — ignore

    // double-tap: toggle zoom, centered (transform-origin stays 50/50 — see CSS).
    const now = Date.now();
    if (now - zoom.lastTapAt < DOUBLE_TAP_MS && Math.hypot(e.clientX - zoom.lastTapX, e.clientY - zoom.lastTapY) < DOUBLE_TAP_SLOP_PX) {
      zoom.lastTapAt = 0; // consumed — a 3rd quick tap starts a fresh pair, not a triple-toggle
      haptic(10);
      if (zoom.scale > 1) resetZoom(true);
      else {
        zoom.scale = DOUBLE_TAP_SCALE;
        applyZoom(activeImg(), true);
      }
      return;
    }
    zoom.lastTapAt = now;
    zoom.lastTapX = e.clientX;
    zoom.lastTapY = e.clientY;

    if (zoom.scale > 1) {
      zoom.pan = { startX: e.clientX, startY: e.clientY, baseX: zoom.x, baseY: zoom.y };
      return;
    }
    drag.y0 = e.clientY;
    drag.x0 = e.clientX;
    drag.active = true;
    drag.decided = false;
    drag.vertical = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (zoom.pointers.has(e.pointerId)) zoom.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (zoom.pointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(zoom.pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoom.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom.pinchStartScale * (dist / zoom.pinchStartDist)));
      applyZoom(activeImg(), false);
      return;
    }

    if (zoom.pan) {
      e.preventDefault();
      const img = activeImg();
      const boundX = img ? (img.clientWidth * (zoom.scale - 1)) / 2 + 40 : 200;
      const boundY = img ? (img.clientHeight * (zoom.scale - 1)) / 2 + 40 : 200;
      zoom.x = Math.min(boundX, Math.max(-boundX, zoom.pan.baseX + (e.clientX - zoom.pan.startX)));
      zoom.y = Math.min(boundY, Math.max(-boundY, zoom.pan.baseY + (e.clientY - zoom.pan.startY)));
      applyZoom(img, false);
      return;
    }

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
    zoom.pointers.delete(e.pointerId);
    if (zoom.pointers.size < 2) zoom.pan = zoom.pointers.size === 1 && zoom.scale > 1 ? zoom.pan : null;
    if (zoom.pointers.size === 0 && zoom.scale < MIN_SCALE) resetZoom(true);
    if (zoom.pointers.size > 0) return; // a second finger is still down mid-pinch release

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

  const onPointerCancel = (e: React.PointerEvent) => {
    zoom.pointers.delete(e.pointerId);
    zoom.pan = null;
    onPointerUp(e);
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
        onPointerCancel={onPointerCancel}
      >
        {s.items.map((it, i) => (
          <figure className="ph-lightbox-frame" key={i}>
            <img
              ref={(el) => (imgRefs.current[i] = el)}
              className="ph-lightbox-img"
              src={it.url}
              alt={mediaAlt(it.caption)}
              draggable={false}
            />
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
