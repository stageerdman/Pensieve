// SpellRing.tsx — the ring of spell glyphs, a spinnable magical dial.
//
// React renders the RESTING layout (the snapped scrollPos). A drag spins the dial by the
// finger's ANGULAR travel about the center (a glyph follows the thumb on either side — no
// mirror), with guards so nearing the center or leaving the ring never makes it jump, and
// real INERTIA on release (momentum → friction → snap to the nearest slot). The dial is
// continuous and loops, so it always responds even when nothing is hidden. Live motion is
// written straight to the nodes (bypassing React, per the 60fps doctrine).

import { useEffect, useRef } from "react";
import { RING, hiddenCounts, isScroll, layoutRing, ringSpacing, snapScroll, type GlyphPos } from "../../lib/spells/ringLayout";
import type { Spell } from "../../lib/spells/types";
import { haptic } from "../../util";
import { SpellGlyph } from "./SpellGlyph";
import type { CenterKind, MenuHue } from "../../hooks/useSpellMenu";

const HOLD_MS = 420;
const DRAG_THRESHOLD = 6; // px before a press becomes a spin
const MAX_STEP_DEG = 30; // clamp a single move's angular delta (kills the center-cross jump)
const MIN_RADIUS = 26; // px: ignore the angle when the finger is this close to the center
const FRICTION = 0.94; // momentum decay per 16ms
const VEL_STOP = 0.0007; // slots/ms below which momentum ends and we settle
const MAX_VEL = 0.03; // slots/ms cap on fling velocity

function angleAt(px: number, py: number, cx: number, cy: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}
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
  const spinnable = n > 1;
  const spacing = ringSpacing(n);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  // gesture + inertia scratch — never triggers a render
  const g = useRef({
    down: false,
    dragging: false,
    longFired: false,
    justDragged: false,
    idx: -1,
    pid: -1,
    cx: 0,
    cy: 0,
    lastAngle: 0,
    lastTime: 0,
    liveP: 0,
    velA: 0, // smoothed angular velocity, deg/ms
  });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // write the resting layout whenever it changes
  useEffect(() => {
    g.current.liveP = scrollPos;
    applyLayout(scrollPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollPos, n]);

  // stop any momentum on unmount
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

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

  function center2(): { cx: number; cy: number } {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return {
      cx: (rect?.left ?? 0) + (rect?.width ?? 0) * RING.centerXFrac,
      cy: (rect?.top ?? 0) + (rect?.height ?? 0) * RING.centerYFrac,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    cancelAnimationFrame(raf.current); // interrupt any momentum
    const node = (e.target as Element).closest<HTMLElement>(".spell-node");
    const idx = node ? Number(node.dataset.index) : -1;
    const { cx, cy } = center2();
    const c = g.current;
    c.down = true;
    c.dragging = false;
    c.longFired = false;
    c.justDragged = false;
    c.idx = idx;
    c.pid = e.pointerId;
    c.cx = cx;
    c.cy = cy;
    c.lastAngle = angleAt(e.clientX, e.clientY, cx, cy);
    c.lastTime = e.timeStamp || performance.now();
    c.velA = 0;
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
    const c = g.current;
    if (!c.down) return;
    const { cx, cy } = c;
    const r = Math.hypot(e.clientX - cx, e.clientY - cy);
    const now = e.timeStamp || performance.now();

    if (!c.dragging) {
      // promote to a spin once the finger has traveled enough
      const movedAngle = Math.abs(deltaAngle(c.lastAngle, angleAt(e.clientX, e.clientY, cx, cy)));
      if (!spinnable || (r * (movedAngle * Math.PI) / 180) < DRAG_THRESHOLD) return;
      c.dragging = true;
      clearHold();
      try {
        surfaceRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      surfaceRef.current?.classList.add("dragging");
    }

    if (r < MIN_RADIUS) {
      // too close to the center → angle is unstable; hold position this frame
      c.lastTime = now;
      return;
    }
    const ang = angleAt(e.clientX, e.clientY, cx, cy);
    let d = deltaAngle(c.lastAngle, ang);
    if (d > MAX_STEP_DEG) d = MAX_STEP_DEG;
    else if (d < -MAX_STEP_DEG) d = -MAX_STEP_DEG;
    const dt = Math.max(1, now - c.lastTime);
    // rotating the wheel by +dθ moves glyph angles up by dθ ⇒ p decreases by dθ/spacing
    c.liveP -= d / spacing;
    c.velA = c.velA * 0.7 + (d / dt) * 0.3; // smoothed deg/ms
    c.lastAngle = ang;
    c.lastTime = now;
    applyLayout(c.liveP);
  }

  function onPointerUp() {
    const c = g.current;
    if (!c.down) return;
    clearHold();
    const { dragging, longFired, idx, pid } = c;
    c.down = false;

    if (dragging) {
      try {
        surfaceRef.current?.releasePointerCapture?.(pid);
      } catch {
        /* no-op */
      }
      surfaceRef.current?.classList.remove("dragging");
      c.justDragged = true; // suppress the synthetic background click
      // fling velocity in slots/ms (sign: +dθ ⇒ −p)
      let velP = -c.velA / spacing;
      if (velP > MAX_VEL) velP = MAX_VEL;
      else if (velP < -MAX_VEL) velP = -MAX_VEL;
      startMomentum(velP);
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

  function startMomentum(velP: number) {
    const c = g.current;
    let last = performance.now();
    let vel = velP;
    const spin = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      c.liveP += vel * dt;
      vel *= Math.pow(FRICTION, dt / 16);
      applyLayout(c.liveP);
      if (Math.abs(vel) > VEL_STOP) {
        raf.current = requestAnimationFrame(spin);
      } else {
        settleTo(snapScroll(c.liveP));
      }
    };
    raf.current = requestAnimationFrame(spin);
  }

  function settleTo(target: number) {
    const c = g.current;
    const step = (_now: number) => {
      c.liveP += (target - c.liveP) * 0.22;
      if (Math.abs(target - c.liveP) < 0.004) {
        c.liveP = target;
        applyLayout(target);
        props.setScroll(target); // commit the resting position
        return;
      }
      applyLayout(c.liveP);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  function onCenter() {
    haptic(8);
    if (center === "back") props.back();
    else if (center === "to-general") props.toGeneral();
    else if (center === "to-suggested") props.toSuggested();
  }

  function onSurfaceClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    if (g.current.justDragged) {
      g.current.justDragged = false;
      return;
    }
    props.onBackdrop();
  }

  const resting = layoutRing(n, scrollPos);
  const hueClass = hue === "accent" ? "hue-accent" : "hue-gold";
  const scroll = isScroll(n);
  const counts = scroll ? hiddenCounts(resting) : { left: 0, right: 0 };

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
              ["--from-x" as string]: `${-pos.x}px`,
              ["--from-y" as string]: `${-pos.y}px`,
              // sweep the bloom by how far the glyph sits from the top (top-first)
              ["--bloom-delay" as string]: `${Math.min(Math.abs(pos.angleDeg) * 0.6, 160)}ms`,
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

      {scroll && counts.left > 0 ? (
        <div className="spell-hidden left" aria-label={`${counts.left} more`}>
          <span className="rh-num">{counts.left}</span>
          <span className="rh-motes" aria-hidden="true">
            <i /><i /><i />
          </span>
        </div>
      ) : null}
      {scroll && counts.right > 0 ? (
        <div className="spell-hidden right" aria-label={`${counts.right} more`}>
          <span className="rh-motes" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="rh-num">{counts.right}</span>
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
            // a counter-clockwise ¾-loop "undo", cubic Béziers only (flag-safe), arrowhead at top
            <svg className="bk" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="bk-arc" pathLength={100} d="M5 13 C 5 16.87 8.13 20 12 20 C 15.87 20 19 16.87 19 13 C 19 9.13 15.87 6 12 6" />
              <path className="bk-head" pathLength={100} d="M14.8 3.9 L12 6 L14.8 8.1" />
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
