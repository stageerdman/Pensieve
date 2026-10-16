// PhoneCollection.tsx — the full-screen "saved collection" (Pinterest board) view. Opened by
// tapping a gallery's composite cover; shows every photo in a vertical MASONRY scroll (CSS
// multi-column — images keep their ratio, no layout math). Close at the top (X), swipe the sheet
// down, or Esc. Tapping a photo opens the single-photo lightbox ON TOP. When the note is editable
// each photo has a quiet × to remove it, and can be DRAG-REORDERED (long-press to lift) — both
// persisted back to the gallery block via the controller.

import { useEffect, useRef, useState } from "react";
import { phoneCollection, type CollectionState } from "../../lib/media/collectionController";
import { phoneLightbox } from "../../lib/media/lightboxController";
import { mediaAlt } from "../../lib/media/noteMedia";
import { NoteActions } from "./NoteActions";
import { haptic } from "../../util";

// Drag-reorder thresholds (see the UX spec): a tile only lifts after a deliberate hold that
// hasn't moved — below this window every gesture belongs to tap / scroll / swipe-close.
const LIFT_MS = 350;
const MOVE_CANCEL_PX = 10;
const EDGE_PX = 72; // top/bottom auto-scroll band
const EDGE_MAX_V = 14; // px/frame cap
const LIFT_SCALE = 1.06;

export function PhoneCollection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [s, setS] = useState<CollectionState>(phoneCollection.get());
  const sheetRef = useRef<HTMLDivElement>(null);
  const masonryRef = useRef<HTMLDivElement>(null);

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

  // iOS: React's onTouchMove is passive and can't block scroll. Attach ONE stable non-passive
  // listener for the open board's life; it preventDefaults only while a tile is actually lifted.
  useEffect(() => {
    if (!s.open) return;
    const m = masonryRef.current;
    if (!m) return;
    const onTouch = (e: TouchEvent) => {
      if (rd.lifted) e.preventDefault();
    };
    m.addEventListener("touchmove", onTouch, { passive: false });
    return () => m.removeEventListener("touchmove", onTouch);
  }, [s.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── drag-reorder state (one gesture at a time; a ref so mid-gesture mutation never re-renders).
  const rd = useRef({
    from: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    timer: 0 as number,
    lifted: false,
    suppressClick: false,
    tileEl: null as HTMLElement | null,
    ghost: null as HTMLElement | null, // the position:fixed clone that actually moves (see beginLift)
    pointerId: -1,
    target: -1,
    before: true,
    rafScroll: 0,
  }).current;

  const clearRing = () => {
    masonryRef.current?.querySelectorAll(".drop-before,.drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
  };

  const stopEdgeScroll = () => {
    if (rd.rafScroll) cancelAnimationFrame(rd.rafScroll);
    rd.rafScroll = 0;
  };

  // LOGICAL reset only — frees `rd` for the next gesture immediately. Removes the ghost and
  // un-dims the source; each terminal path that wants an ANIMATED ghost detaches it from `rd` first
  // (so this never nukes an in-flight settle animation).
  const resetDrag = () => {
    window.clearTimeout(rd.timer);
    stopEdgeScroll();
    clearRing();
    const m = masonryRef.current;
    m?.classList.remove("reordering");
    try {
      if (rd.pointerId >= 0) m?.releasePointerCapture?.(rd.pointerId);
    } catch {
      /* capture may already be gone */
    }
    rd.ghost?.remove();
    rd.ghost = null;
    rd.tileEl?.classList.remove("drag-source");
    rd.from = -1;
    rd.tileEl = null;
    rd.pointerId = -1;
    rd.lifted = false;
    rd.target = -1;
  };

  // Ease the ghost back to the source slot when a lift ends without a move. Detach the ghost +
  // source from `rd`, free the logical state, then fly the captured ghost home and remove it.
  const animateHome = () => {
    const g = rd.ghost;
    const src = rd.tileEl;
    rd.ghost = null; // detach so resetDrag won't remove it mid-animation
    rd.tileEl = null;
    resetDrag();
    src?.classList.remove("drag-source");
    if (!g) return;
    g.style.transition = "transform .18s ease, opacity .18s ease";
    g.style.transform = "translate3d(0,0,0) scale(1)";
    g.style.opacity = "0";
    window.setTimeout(() => g.remove(), 210);
  };

  // Lift = build a position:FIXED clone of the tile pinned to its current viewport rect, and dim
  // the original in place as a placeholder. The ghost is what follows the finger — it lives OUTSIDE
  // the CSS multi-column flow, so Safari's multicol+transform mis-render (right-column tiles jumping
  // to the left / vanishing) cannot happen. The in-flow tile is never transformed.
  const beginLift = (x: number, y: number) => {
    const tile = rd.tileEl;
    const m = masonryRef.current;
    const sheet = sheetRef.current;
    if (!tile || !m || !sheet) return;
    rd.lifted = true;
    haptic(18);

    const rect = tile.getBoundingClientRect();
    const g = tile.cloneNode(true) as HTMLElement;
    g.classList.add("ph-drag-ghost");
    g.classList.remove("drop-before", "drop-after");
    g.querySelectorAll(".ph-collection-remove").forEach((b) => b.remove());
    g.style.left = `${rect.left}px`;
    g.style.top = `${rect.top}px`;
    g.style.width = `${rect.width}px`;
    g.style.height = `${rect.height}px`;
    sheet.appendChild(g);
    rd.ghost = g;
    tile.classList.add("drag-source");

    m.classList.add("reordering");
    // Capture on the MASONRY (stable, pointer-events:auto) so moves keep arriving even as the finger
    // leaves the source tile. The ghost is pointer-events:none → elementFromPoint reads tiles under it.
    try {
      m.setPointerCapture?.(rd.pointerId);
    } catch {
      /* ignore */
    }
    hitTest(x, y);
  };

  const hitTest = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const tile = el?.closest(".ph-collection-tile") as HTMLElement | null;
    if (!tile || tile === rd.tileEl) return;
    const t = Number(tile.dataset.index);
    if (Number.isNaN(t)) return;
    const r = tile.getBoundingClientRect();
    const before = y < r.top + r.height / 2;
    if (t !== rd.target || before !== rd.before) {
      clearRing();
      rd.target = t;
      rd.before = before;
      tile.classList.add(before ? "drop-before" : "drop-after");
      haptic(8);
    }
  };

  const edgeScroll = (y: number) => {
    const m = masonryRef.current;
    if (!m) return;
    const r = m.getBoundingClientRect();
    let v = 0;
    if (y < r.top + EDGE_PX) v = -EDGE_MAX_V * (1 - (y - r.top) / EDGE_PX);
    else if (y > r.bottom - EDGE_PX) v = EDGE_MAX_V * (1 - (r.bottom - y) / EDGE_PX);
    if (v === 0) return stopEdgeScroll();
    if (!rd.rafScroll) {
      const step = () => {
        // Recompute speed from the LATEST finger position so the loop self-terminates the moment
        // the finger leaves the edge band (never a runaway rAF after the drag).
        const rr = m.getBoundingClientRect();
        const yy = rd.lastY;
        let vv = 0;
        if (yy < rr.top + EDGE_PX) vv = -EDGE_MAX_V * (1 - (yy - rr.top) / EDGE_PX);
        else if (yy > rr.bottom - EDGE_PX) vv = EDGE_MAX_V * (1 - (rr.bottom - yy) / EDGE_PX);
        if (vv === 0 || !rd.lifted) {
          rd.rafScroll = 0;
          return;
        }
        m.scrollTop += vv;
        hitTest(rd.lastX, rd.lastY); // re-resolve target as content scrolls under a still finger
        rd.rafScroll = requestAnimationFrame(step);
      };
      rd.rafScroll = requestAnimationFrame(step);
    }
  };

  const commitDrop = () => {
    if (rd.target < 0) return animateHome();
    const insertPos = rd.before ? rd.target : rd.target + 1; // gap index 0..n
    const to = rd.from < insertPos ? insertPos - 1 : insertPos; // remove-then-insert correction
    if (to === rd.from) return animateHome();
    haptic(12);
    const from = rd.from;
    resetDrag(); // removes the ghost + un-dims the source in one shot
    // Stable keys (keyed by url below) mean React MOVES the existing node into place rather than
    // rebuilding it — no <img> reload, no flash, one reflow.
    phoneCollection.reorder(from, to);
  };

  // ── pointer handlers. pointerdown is per-tile (to learn `from`); move/up/cancel live on the
  // masonry (events bubble up pre-lift; retarget to it after capture) so one set handles both phases.
  const onTileDown = (i: number) => (e: React.PointerEvent) => {
    if (!s.editable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const tile = (e.currentTarget as HTMLElement).closest(".ph-collection-tile") as HTMLElement | null;
    if (!tile) return;
    rd.from = i;
    rd.tileEl = tile;
    rd.pointerId = e.pointerId;
    rd.startX = rd.lastX = e.clientX;
    rd.startY = rd.lastY = e.clientY;
    rd.lifted = false;
    rd.suppressClick = false;
    rd.target = -1;
    window.clearTimeout(rd.timer);
    rd.timer = window.setTimeout(() => beginLift(rd.lastX, rd.lastY), LIFT_MS);
    // NOTE: no preventDefault / no capture here — scroll must stay free until a real lift.
  };

  const onMasonryMove = (e: React.PointerEvent) => {
    if (rd.from < 0) return;
    if (rd.pointerId >= 0 && e.pointerId !== rd.pointerId) return; // ignore a second finger
    rd.lastX = e.clientX;
    rd.lastY = e.clientY;
    const dx = e.clientX - rd.startX;
    const dy = e.clientY - rd.startY;
    if (!rd.lifted) {
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        window.clearTimeout(rd.timer);
        rd.from = -1;
        rd.tileEl = null; // a real scroll owns the gesture now
      }
      return;
    }
    e.preventDefault();
    if (rd.ghost) rd.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${LIFT_SCALE})`;
    hitTest(e.clientX, e.clientY);
    edgeScroll(e.clientY);
  };

  const onMasonryUp = (e: React.PointerEvent) => {
    if (rd.from < 0) return;
    if (rd.pointerId >= 0 && e.pointerId !== rd.pointerId) return;
    window.clearTimeout(rd.timer);
    stopEdgeScroll();
    if (!rd.lifted) {
      resetDrag(); // was a tap → let the img onClick open the lightbox
      return;
    }
    rd.suppressClick = true;
    commitDrop();
  };

  const onMasonryCancel = () => {
    if (rd.from < 0) return;
    window.clearTimeout(rd.timer);
    stopEdgeScroll();
    if (rd.lifted) animateHome();
    else resetDrag();
  };

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

  // STABLE keys — keyed by the photo's url (not its index), so a reorder makes React MOVE the
  // existing tile node (and its already-decoded <img>) to the new slot instead of rebuilding it.
  // Duplicate urls in one board are disambiguated by occurrence so keys stay unique and stable.
  const seenUrl = new Map<string, number>();
  const itemKeys = s.items.map((it) => {
    const n = seenUrl.get(it.url) ?? 0;
    seenUrl.set(it.url, n + 1);
    return `${it.url}#${n}`;
  });

  return (
    <div className="ph-collection" role="dialog" aria-modal="true" aria-label="Photo collection" ref={sheetRef}>
      {/* A slim top grabber is ONLY a swipe-down-to-close handle (a gesture affordance, not a
          control bar). The real controls live in the bottom action bar below (phone standard). */}
      <div
        className="ph-collection-grab"
        aria-hidden="true"
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <span className="ph-collection-grabber" />
      </div>
      <div
        className="ph-collection-masonry"
        ref={masonryRef}
        onPointerMove={onMasonryMove}
        onPointerUp={onMasonryUp}
        onPointerCancel={onMasonryCancel}
      >
        {s.items.map((it, i) => (
          <div className="ph-collection-tile" data-index={i} key={itemKeys[i]}>
            <img
              src={it.url}
              alt={mediaAlt(it.caption)}
              draggable={false}
              onPointerDown={onTileDown(i)}
              onClick={() => {
                if (rd.suppressClick) {
                  rd.suppressClick = false;
                  return; // this click is the tail of a drag — don't open the lightbox
                }
                phoneLightbox.open(s.items, i);
              }}
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
      {/* Bottom control bar = the 4-cell Dock (phone standard): Back → the memory; the Spell Menu
          opener blooms the Conditional "Photo" ring, which adds a photo to THIS board. */}
      <NoteActions onBack={() => phoneCollection.close()} onOpenMenu={onOpenMenu} />
    </div>
  );
}
