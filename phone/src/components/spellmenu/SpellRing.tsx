// SpellRing.tsx — the ring of spell glyphs at the center of the overlay.
//
// Positions come from the pure layoutRing(); React renders the RESTING layout (the snapped
// scrollPos). A vertical drag rotates a scroll ring live by writing transforms straight to
// the nodes (bypassing React, per the 60fps doctrine), then snaps on release. A tap on a
// glyph activates it (detailed → descend, window → open, else → cast); a hold runs its
// long-press action (Write = speak). The center slot carries the nav (back / form toggle).

import { useEffect, useRef } from "react";
import type { Spell } from "../../lib/spells/types";
import { dragToScroll, isScroll, layoutRing, maxScroll, snapScroll, type GlyphPos } from "../../lib/spells/ringLayout";
import { haptic } from "../../util";
import { SpellGlyph } from "./SpellGlyph";
import type { CenterKind, MenuHue } from "../../hooks/useSpellMenu";

const HOLD_MS = 420;
const DRAG_THRESHOLD = 6; // px before a press becomes a scroll drag

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
  const g = useRef({ down: false, dragging: false, longFired: false, justDragged: false, startY: 0, startP: 0, liveP: 0, idx: -1, pid: -1 });
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
    g.current = { down: true, dragging: false, longFired: false, justDragged: false, startY: e.clientY, startP: scrollPos, liveP: scrollPos, idx, pid: e.pointerId };
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
    const dy = e.clientY - g.current.startY;
    if (!g.current.dragging && Math.abs(dy) > DRAG_THRESHOLD) {
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
      const p = Math.max(0, Math.min(maxScroll(n), g.current.startP - dragToScroll(dy)));
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
            <button
              type="button"
              className={`spell-btn ${spellHue}`}
              aria-label={spell.name}
              aria-disabled={spell.disabled || undefined}
            >
              <SpellGlyph icon={spell.icon} size={26} />
              {spell.children?.length ? <span className="spell-has-more" aria-hidden="true" /> : null}
            </button>
            <span className="spell-label">{spell.name}</span>
          </div>
        );
      })}

      {center !== "none" ? (
        <button type="button" className={`spell-center ${conditional ? "conditional" : ""}`} onClick={onCenter}>
          {center === "back" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          ) : (
            <span className="spell-center-label">{center === "to-general" ? "General" : "Suggested"}</span>
          )}
        </button>
      ) : (
        <span className="spell-core" aria-hidden="true" />
      )}
    </div>
  );
}
