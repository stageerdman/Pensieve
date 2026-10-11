// SpellRing.tsx — the ring of spell glyphs at the center of the overlay.
//
// Positions come from the pure layoutRing(); React renders the RESTING layout (the snapped
// scrollPos). A vertical drag rotates a scroll ring live by writing transforms straight to
// the nodes (bypassing React, per the 60fps doctrine), then snaps on release. A tap on a
// glyph activates it (detailed → descend, window → open, else → cast); a hold runs its
// long-press action (Write = speak). The center slot carries the nav (back / form toggle).

import { useEffect, useRef } from "react";
import type { Spell } from "../../lib/spells/types";
import { RING, isScroll, layoutRing, maxScroll, snapScroll, type GlyphPos } from "../../lib/spells/ringLayout";
import { haptic } from "../../util";
import { SpellGlyph } from "./SpellGlyph";
import type { CenterKind, MenuHue } from "../../hooks/useSpellMenu";

const HOLD_MS = 420;
const DRAG_THRESHOLD = 6; // px before a press becomes a scroll drag

/** Finger angle (deg, clockwise from 12 o'clock) about the ring center — matches layoutRing. */
function angleAt(px: number, py: number, cx: number, cy: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}
/** Shortest signed angular delta, folded into (−180, 180]. */
function deltaAngle(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface SpellRingHandlers {
  onCast: (spell: Spell) => void;
  onLongCast: (spell: Spell) => void;
  enterDetailed: (spell: Spell) => void;
  openWindow: (spellId: string) => void;
  back: () => void;
  toGeneral: () => void;
  toSuggested: () => void;
  setScroll: (p: number) => void;
  /** tap on the blurred background (not a spell) → dismiss the whole overlay. */
  onBackdrop: () => void;
}

export interface SpellRingProps extends SpellRingHandlers {
  spells: Spell[];
  hue: MenuHue;
  center: CenterKind;
  scrollPos: number;
  conditional: boolean;
  reduce: boolean;
}

function glyphTransform(pos: GlyphPos): string {
  return `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${pos.scale})`;
}

export function SpellRing(props: SpellRingProps) {
  const { spells, hue, center, scrollPos, conditional, reduce } = props;
  const n = spells.length;
  const scroll = isScroll(n);

  const surfaceRef = useRef<HTMLDivElement>(null);
  // gesture scratch — never triggers a render
  const g = useRef({
    down: false,
    dragging: false,
    longFired: false,
    justDragged: false,
    startX: 0,
    startY: 0,
    startAngle: 0,
    cx: 0,
    cy: 0,
    startP: 0,
    liveP: 0,
    idx: -1,
    pid: -1,
  });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // write the resting layout whenever it changes (also the target of the release snap)
  useEffect(() => {
    applyLayout(scrollPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollPos, n]);

  function applyLayout(p: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const poss = layoutRing(n, p);
    const nodes = surface.querySelectorAll<HTMLElement>(".spell-node");
    poss.forEach((pos, i) => {
      const el = nodes[i];
      if (!el) return;
      el.style.transform = glyphTransform(pos);
      el.style.opacity = String(pos.opacity);
      el.style.pointerEvents = pos.visible ? "auto" : "none";
      el.classList.toggle("focus", pos.focus);
    });
  }

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const node = (e.target as Element).closest<HTMLElement>(".spell-node");
    const idx = node ? Number(node.dataset.index) : -1;
    const rect = surfaceRef.current?.getBoundingClientRect();
    const cx = (rect?.left ?? 0) + (rect?.width ?? 0) * RING.centerXFrac;
    const cy = (rect?.top ?? 0) + (rect?.height ?? 0) * RING.centerYFrac;
    g.current = {
      down: true,
      dragging: false,
      longFired: false,
      justDragged: false,
      startX: e.clientX,
      startY: e.clientY,
      startAngle: angleAt(e.clientX, e.clientY, cx, cy),
      cx,
      cy,
      startP: scrollPos,
      liveP: scrollPos,
      idx,
      pid: e.pointerId,
    };
    clearHold();
    if (idx >= 0) {
      const spell = spells[idx];
      if (spell?.longPress) {
        holdTimer.current = setTimeout(() => {
          if (g.current.dragging) return;
          g.current.longFired = true;
          haptic(16);
          props.onLongCast(spell);
        }, HOLD_MS);
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!g.current.down) return;
    const moved = Math.hypot(e.clientX - g.current.startX, e.clientY - g.current.startY);
    if (!g.current.dragging && moved > DRAG_THRESHOLD) {
      if (!scroll) return; // static rings don't scroll
      g.current.dragging = true;
      clearHold();
      // capture only once a real drag begins, so taps still fire normal click events
      try {
        surfaceRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      surfaceRef.current?.classList.add("dragging");
    }
    if (g.current.dragging) {
      // ANGULAR grab-spin: the wheel rotates by the finger's angular travel about the
      // center, so a glyph follows the thumb wherever you grab it (no left/right mirror).
      const now = angleAt(e.clientX, e.clientY, g.current.cx, g.current.cy);
      const d = deltaAngle(g.current.startAngle, now);
      const p = Math.max(0, Math.min(maxScroll(n), g.current.startP - d / RING.pitchDeg));
      g.current.liveP = p;
      applyLayout(p);
    }
  }

  function onPointerUp() {
    if (!g.current.down) return;
    clearHold();
    const { dragging, longFired, idx, pid } = g.current;
    g.current.down = false;

    if (dragging) {
      try {
        surfaceRef.current?.releasePointerCapture?.(pid);
      } catch {
        /* no-op */
      }
      surfaceRef.current?.classList.remove("dragging");
      const snapped = snapScroll(n, g.current.liveP);
      applyLayout(snapped);
      props.setScroll(snapped);
      g.current.justDragged = true; // suppress the synthetic background click
      return;
    }
    if (longFired || idx < 0) return;

    const spell = spells[idx];
    if (!spell || spell.disabled) return;
    haptic(10);
    if (spell.children?.length) props.enterDetailed(spell);
    else if (spell.opensWindow) props.openWindow(spell.id);
    else props.onCast(spell);
  }

  // a click that lands on the surface itself (not a glyph or the center) dismisses
  function onSurfaceClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    if (g.current.justDragged) {
      g.current.justDragged = false;
      return;
    }
    props.onBackdrop();
  }

  function onCenter() {
    haptic(8);
    if (center === "back") props.back();
    else if (center === "to-general") props.toGeneral();
    else if (center === "to-suggested") props.toSuggested();
  }

  const resting = layoutRing(n, scrollPos);
  const hueClass = hue === "accent" ? "hue-accent" : "hue-gold";

  // how many spells drift hidden beyond each end of a scroll ring
  const vis = resting.filter((gp) => gp.visible).map((gp) => gp.index);
  const hiddenBefore = vis.length ? Math.min(...vis) : 0;
  const hiddenAfter = vis.length ? n - 1 - Math.max(...vis) : 0;

  return (
    <div
      className={`spell-ring ${hueClass}${scroll ? " scroll" : ""}${reduce ? " reduce" : ""}`}
      ref={surfaceRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onSurfaceClick}
      role="menu"
      aria-label="Spell menu"
    >
      {spells.map((spell, i) => {
        const pos = resting[i];
        const spellHue =
          spell.hue === "violet" ? "spell-violet" : spell.hue === "gold-state" ? "spell-syncgold" : "";
        return (
          <div
            key={spell.id}
            className="spell-node"
            data-index={i}
            style={{
              transform: glyphTransform(pos),
              opacity: pos.opacity,
              // stagger each glyph's bloom in from the hub (negative radial offset)
              ["--from-x" as string]: `${-pos.x}px`,
              ["--from-y" as string]: `${-pos.y}px`,
              ["--bloom-delay" as string]: `${Math.min(i * 14, 140)}ms`,
            }}
          >
            <div className="spell-bloom">
              <button
                type="button"
                className={`spell-btn ${spellHue}`}
                aria-label={spell.name}
                aria-disabled={spell.disabled || undefined}
              >
                <SpellGlyph icon={spell.icon} size={30} />
                {spell.children?.length ? <span className="spell-has-more" aria-hidden="true" /> : null}
              </button>
            </div>
            <span className="spell-label">{spell.name}</span>
          </div>
        );
      })}

      {scroll && hiddenBefore > 0 ? (
        <div className="spell-hidden top" aria-label={`${hiddenBefore} more above`}>
          <span className="rh-motes" aria-hidden="true">
            <i /><i /><i />
          </span>
          <svg className="rh-chev" viewBox="0 0 16 10" width="13" height="8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 7 L8 2 L14 7" />
          </svg>
          <span className="rh-num">{hiddenBefore}</span>
        </div>
      ) : null}
      {scroll && hiddenAfter > 0 ? (
        <div className="spell-hidden bottom" aria-label={`${hiddenAfter} more below`}>
          <span className="rh-num">{hiddenAfter}</span>
          <svg className="rh-chev" viewBox="0 0 16 10" width="13" height="8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 3 L8 8 L14 3" />
          </svg>
          <span className="rh-motes" aria-hidden="true">
            <i /><i /><i />
          </span>
        </div>
      ) : null}

      {center !== "none" ? (
        <button
          type="button"
          className={`spell-center ${center === "back" ? "back" : "text"} ${conditional ? "conditional" : ""}`}
          onClick={onCenter}
          aria-label={center === "back" ? "Back" : center === "to-general" ? "See general spells" : "See local spells"}
        >
          {center === "back" ? (
            // a wand-flick curved arrow, floating (no disc)
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 6.5a6 6 0 1 1-6 9.8" strokeWidth="1.8" />
              <path d="M8 9.5 8.2 15.6 14 15" strokeWidth="1.8" />
            </svg>
          ) : (
            <span className="spell-center-label">{center === "to-general" ? "see general" : "see local"}</span>
          )}
        </button>
      ) : (
        <span className="spell-core" aria-hidden="true" />
      )}
    </div>
  );
}
