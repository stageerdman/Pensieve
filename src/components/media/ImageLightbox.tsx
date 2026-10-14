import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../IconButton";
import { X, ChevronLeft, ChevronRight } from "../icons";
import { lightbox, type LightboxOpenOptions } from "./lightboxController";
import { mediaAlt } from "../../lib/media";
import { log } from "../../lib/logger";

// The ONE magical moment (wiki "lightbox"): a thumbnail travels (FLIP / shared-element)
// from its on-page rect to the centre, the rest of the app recedes behind a blurred +
// darkened backdrop, and the image floats crisp and letterboxed with a faint water-light
// + halo. It REUSES PreviewPortal's visual language verbatim — the `focus-backdrop`,
// `portal-halo` and `portal-water` classes from index.css (NOT a new overlay look); only
// the image framing / chrome / FLIP transition are new here.
//
// z-30 ("preview/overlay" in design.md) — deliberately BELOW z-40 modal and z-50 toast,
// so a StatusWhisper still surfaces over an open lightbox.
//
// One lightbox serves one OR many images: `items` of length 1 hides the arrows + counter;
// Phase 3 passes the whole gallery with zero change here.

const TRAVEL_MS = 200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The transform that visually places `frame`'s current rect onto `origin` (top-left
 *  transform-origin). Applied instantly then transitioned away = the travel in. */
function transformTo(frame: DOMRect, origin: DOMRect): string {
  const sx = origin.width / (frame.width || 1);
  const sy = origin.height / (frame.height || 1);
  const tx = origin.left - frame.left;
  const ty = origin.top - frame.top;
  return `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
}

export function ImageLightbox() {
  const [data, setData] = useState<LightboxOpenOptions | null>(null);
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  // Zoom + pan (the owner wants to inspect closer — desktop wheel/trackpad + drag).
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const traveledRef = useRef(false); // the enter-travel only plays once per open

  const items = data?.items ?? [];
  const many = items.length > 1;
  const current = items[index];

  const restoreFocus = useCallback((el?: HTMLElement | null) => {
    if (el && typeof el.focus === "function") el.focus();
  }, []);

  const step = useCallback((to: number) => {
    setData((d) => {
      if (d) setIndex(Math.min(Math.max(0, to), d.items.length - 1));
      return d;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset zoom/pan whenever the shown image changes (step) or a new open sets the index.
  useEffect(() => {
    resetZoom();
  }, [index, data, resetZoom]);

  // Wheel / trackpad-pinch to zoom (native non-passive listener so we can preventDefault
  // the page scroll). Returning to 1× recenters.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !data) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = Math.min(4, Math.max(1, z * (1 - e.deltaY * 0.0015)));
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data]);

  // Drag to pan when zoomed in.
  const onImgPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setPanning(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onImgPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setOffset({ x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
  };
  const onImgPointerUp = () => {
    panRef.current = null;
    setPanning(false);
  };
  // Double-click toggles fit ↔ 2×.
  const toggleZoom = () => setZoom((z) => (z > 1 ? 1 : 2));

  // ── the rect→centre travel in (FLIP). Runs once the image frame has a layout box. ──
  const playEnter = useCallback(() => {
    if (traveledRef.current) return;
    const frame = frameRef.current;
    if (!frame || !data) return;
    if (prefersReducedMotion() || !data.originRect) {
      traveledRef.current = true; // reduced-motion / no-rect → the CSS cross-fade handles it
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // not laid out yet — img onLoad will retry
    traveledRef.current = true;
    const t = transformTo(rect, data.originRect);
    frame.style.transformOrigin = "top left";
    frame.style.transition = "none";
    frame.style.transform = t;
    void frame.offsetWidth; // reflow so the start transform sticks
    frame.style.transition = `transform ${TRAVEL_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    frame.style.transform = "";
  }, [data]);

  // ── close: collapse reverses the travel; reduced-motion / off-origin item just cuts ──
  const beginClose = useCallback(() => {
    setData((d) => {
      if (!d) return d;
      const frame = frameRef.current;
      const atOrigin = index === d.index;
      const cut = () => {
        traveledRef.current = false;
        setClosing(false);
        restoreFocus(d.originElement);
        log.info("media", "lightbox.close", {});
      };
      if (prefersReducedMotion() || !d.originRect || !atOrigin || !frame) {
        // Immediate cut (we can't cleanly reverse-travel to a non-origin item's rect).
        queueMicrotask(cut);
        return null;
      }
      // Reverse FLIP: transition the centred frame back onto the origin rect.
      setClosing(true);
      const rect = frame.getBoundingClientRect();
      const t = transformTo(rect, d.originRect);
      const originElement = d.originElement;
      frame.style.transformOrigin = "top left";
      frame.style.transition = `transform ${TRAVEL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      requestAnimationFrame(() => {
        frame.style.transform = t;
      });
      const done = () => {
        frame.removeEventListener("transitionend", done);
        traveledRef.current = false;
        setClosing(false);
        setData(null);
        restoreFocus(originElement);
        log.info("media", "lightbox.close", {});
      };
      frame.addEventListener("transitionend", done);
      // Safety net: transitionend can be skipped (interrupted / no layout) — never hang.
      window.setTimeout(done, TRAVEL_MS + 80);
      return d; // keep mounted through the exit; `done` nulls it
    });
  }, [index, restoreFocus]);

  // ── open / programmatic close: driven by the controller ───────────────────────────
  useEffect(
    () =>
      lightbox.subscribe((open) => {
        if (open) {
          traveledRef.current = false;
          setClosing(false);
          setIndex(Math.min(Math.max(0, open.index), open.items.length - 1));
          setData(open);
          log.info("media", "lightbox.open", { count: open.items.length, index: open.index });
        } else {
          beginClose();
        }
      }),
    [beginClose],
  );

  useLayoutEffect(() => {
    if (data && !closing) playEnter();
  }, [data, index, closing, playEnter]);

  // ── keyboard: Esc, ←/→, Home/End, and a Tab trap within the dialog ────────────────
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          beginClose();
          break;
        case "ArrowLeft":
          if (many) {
            e.preventDefault();
            step(index - 1);
          }
          break;
        case "ArrowRight":
          if (many) {
            e.preventDefault();
            step(index + 1);
          }
          break;
        case "Home":
          if (many) {
            e.preventDefault();
            step(0);
          }
          break;
        case "End":
          if (many) {
            e.preventDefault();
            step(items.length - 1);
          }
          break;
        case "Tab": {
          // Trap focus among the dialog's controls (close + chevrons).
          const layer = layerRef.current;
          if (!layer) return;
          const focusable = Array.from(layer.querySelectorAll<HTMLElement>("button:not([disabled])"));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (e.shiftKey && (active === first || !layer.contains(active))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (active === last || !layer.contains(active))) {
            e.preventDefault();
            first.focus();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [data, index, many, items.length, step, beginClose]);

  // Move focus into the dialog on open (focus trap start).
  useEffect(() => {
    if (data && !closing) closeBtnRef.current?.focus();
  }, [data, closing]);

  if (!data || !current) return null;

  const label = current.caption
    ? `Image: ${current.caption}`
    : many
      ? `Image ${index + 1} of ${items.length}`
      : "Image viewer";

  const zoomed = zoom !== 1 || offset.x !== 0 || offset.y !== 0;

  const overlay = (
    <>
      {/* Layer 1 — a real full-viewport dim + blur so the image pops. (We do NOT reuse the
          gallery's `focus-backdrop`: its radial mask makes the CENTRE transparent — exactly
          where the lightbox image sits — so it never darkened here. A dark scrim reads in
          both themes, as a photo viewer should.) */}
      <div className="lightbox-backdrop" aria-hidden />

      {/* Layer 2 — the subject + chrome. Clicking the empty backdrop dismisses. */}
      <div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="lightbox-layer"
        onClick={(e) => {
          if (e.target === e.currentTarget) beginClose();
        }}
      >
        <div
          ref={frameRef}
          className={"lightbox-frame" + (data.originRect ? "" : " portal-enter")}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={toggleZoom}
        >
          <span className="portal-halo" aria-hidden />
          <img
            className="lightbox-img"
            src={current.url}
            alt={mediaAlt(current.caption)}
            draggable={false}
            onLoad={playEnter}
            onPointerDown={onImgPointerDown}
            onPointerMove={onImgPointerMove}
            onPointerUp={onImgPointerUp}
            onPointerCancel={onImgPointerUp}
            style={{
              transform: zoomed ? `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` : undefined,
              transition: panRef.current ? "none" : "transform 140ms ease",
              cursor: zoom > 1 ? (panning ? "grabbing" : "grab") : "zoom-in",
            }}
          />
          <span className="portal-water" aria-hidden />
        </div>

        {current.caption && (
          <div className="lightbox-caption text-sm text-text-muted" onClick={(e) => e.stopPropagation()}>
            {current.caption}
          </div>
        )}

        {/* Chrome — real IconButtons; nav + counter hidden for a single image. */}
        <div className="lightbox-close">
          <IconButton ref={closeBtnRef} label="Close" title="Close  Esc" onClick={beginClose}>
            <X />
          </IconButton>
        </div>

        {many && (
          <>
            <div className="lightbox-nav lightbox-prev">
              <IconButton label="Previous image" title="Previous  ←" onClick={() => step(index - 1)}>
                <ChevronLeft />
              </IconButton>
            </div>
            <div className="lightbox-nav lightbox-next">
              <IconButton label="Next image" title="Next  →" onClick={() => step(index + 1)}>
                <ChevronRight />
              </IconButton>
            </div>
            <div className="lightbox-counter text-sm text-text-muted" aria-live="polite">
              {index + 1} / {items.length}
            </div>
          </>
        )}
      </div>
    </>
  );

  return createPortal(overlay, document.body);
}
