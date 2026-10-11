// SpellRing.tsx — the ring of spell glyphs, a spinnable magical dial.
//
// React renders the RESTING layout (the snapped scrollPos). A drag spins the dial by the
// finger's ANGULAR travel about the center (a glyph follows the thumb on either side — no
// mirror), with guards so nearing the center or leaving the ring never makes it jump, and
// real INERTIA on release (momentum → friction → settle). Full circles loop; finite arcs
// rubber-band at the ends. Live motion is written straight to the nodes (bypassing React,
// per the 60fps doctrine) with `transition:none` held for the whole spin so CSS never
// double-smooths it. Casting is on the glyph <button> (keyboard/VoiceOver reachable); the
// pointer gesture only spins.

import { useEffect, useRef } from "react";
import { RING, clampScroll, focusIndex, hiddenCounts, isScroll, layoutRing, loops, ringSpacing, snapScroll, type GlyphPos } from "../../lib/spells/ringLayout";
import type { Spell } from "../../lib/spells/types";
import { haptic } from "../../util";
import { SpellGlyph } from "./SpellGlyph";
import type { CenterKind, MenuHue } from "../../hooks/useSpellMenu";

const HOLD_MS = 500; // long-press (Write = speak) — matches iOS default
const DRAG_THRESHOLD = 11; // px before a press becomes a spin (thumb-drift taps still register)
const MAX_STEP_DEG = 30; // clamp a single move's angular delta for the POSITION write (center-jump guard)
const MIN_RADIUS = 26; // px: ignore the angle when the finger is this close to the center
const FRICTION = 0.94; // momentum decay per 16ms
const VEL_STOP = 0.0035; // slots/ms: hand off to settle while still moving (no end-tug)
const MAX_VEL = 0.03; // slots/ms cap on fling velocity
const SETTLE_TAU = 90; // ms: framerate-independent settle time-constant
const RUBBER = 0.35; // finite-arc overscroll resistance
const RUBBER_CAP = 0.45; // max slots a finite arc may be dragged past its end
const PAUSE_MS = 50; // holding still this long before lift → no fling (just snap)
const DETENT = 4; // haptic tick as a glyph crosses the top during a spin

function angleAt(px: number, py: number, cx: number, cy: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}
function deltaAngle(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Which glyphs show a label (to keep the ring uncluttered when there are many):
 * the 3 nearest the TOP (label above), plus — only when nothing is hidden — the 3 nearest
 * the BOTTOM (label below). Everything else is unlabelled.
 */
function labelGroups(poss: GlyphPos[]): { above: Set<number>; below: Set<number> } {
  const hiddenAny = poss.some((x) => !x.visible);
  const sorted = poss.map((x, i) => ({ i, a: Math.abs(x.angleDeg) })).sort((u, v) => u.a - v.a);
  const above = new Set(sorted.slice(0, 3).map((o) => o.i));
  const below = new Set<number>();
  if (!hiddenAny) {
    for (let k = sorted.length - 1; k >= 0 && below.size < 3; k--) {
      const idx = sorted[k].i;
      if (!above.has(idx)) below.add(idx);
    }
  }
  return { above, below };
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
  const loop = loops(n);
  const maxArc = Math.max(0, n - 1);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  // gesture + inertia scratch — never triggers a render
  const g = useRef({
    down: false,
    dragging: false,
    spinning: false, // true through drag + momentum + settle (holds transition:none + detents)
    longFired: false,
    justDragged: false,
    idx: -1,
    pid: -1,
    cx: 0,
    cy: 0,
    lastAngle: 0,
    lastTime: 0,
    liveP: 0,
    rawP: 0, // unclamped position (for rubber-band)
    velA: 0, // smoothed angular velocity, deg/ms
    lastFocus: 0,
  });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // write the resting layout whenever it changes
  useEffect(() => {
    g.current.liveP = scrollPos;
    g.current.rawP = scrollPos;
    g.current.lastFocus = focusIndex(n, scrollPos);
    applyLayout(scrollPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollPos, n]);

  // a light tick when the ring is summoned / a view resolves
  useEffect(() => {
    if (!reduce) haptic(6);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLayout(p: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const poss = layoutRing(n, p);
    const { above, below } = labelGroups(poss);
    const nodes = surface.querySelectorAll<HTMLElement>(".spell-node");
    poss.forEach((pos, i) => {
      const el = nodes[i];
      if (!el) return;
      el.style.transform = glyphTransform(pos);
      el.style.opacity = String(pos.opacity);
      el.style.pointerEvents = pos.visible ? "auto" : "none";
      el.classList.toggle("focus", pos.focus);
      el.classList.toggle("label-above", above.has(i));
      el.classList.toggle("label-below", below.has(i));
    });
    // live hidden-counts (update as you scroll, not only at rest)
    const hc = hiddenCounts(poss);
    const le = surface.querySelector<HTMLElement>(".spell-hidden.left");
    const re = surface.querySelector<HTMLElement>(".spell-hidden.right");
    if (le) {
      le.classList.toggle("is-zero", hc.left <= 0);
      const t = le.querySelector(".rh-num");
      if (t) t.textContent = String(hc.left);
    }
    if (re) {
      re.classList.toggle("is-zero", hc.right <= 0);
      const t = re.querySelector(".rh-num");
      if (t) t.textContent = String(hc.right);
    }
    // detent tick as the focused glyph changes during a spin (a real wheel "ticks")
    const f = focusIndex(n, p);
    if (f !== g.current.lastFocus) {
      g.current.lastFocus = f;
      if (g.current.spinning && !reduce) haptic(DETENT);
    }
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

  /** finite-arc rubber-band: past an end, movement is resisted and capped. */
  function rubber(raw: number): number {
    if (loop) return raw;
    if (raw < 0) return -Math.min(RUBBER_CAP, -raw * RUBBER);
    if (raw > maxArc) return maxArc + Math.min(RUBBER_CAP, (raw - maxArc) * RUBBER);
    return raw;
  }

  function startSpin() {
    const c = g.current;
    c.spinning = true;
    surfaceRef.current?.classList.add("spinning");
  }
  function endSpin() {
    g.current.spinning = false;
    surfaceRef.current?.classList.remove("spinning");
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
    c.lastTime = performance.now();
    c.velA = 0;
    c.rawP = c.liveP;
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
    const now = performance.now();

    if (!c.dragging) {
      const movedAngle = Math.abs(deltaAngle(c.lastAngle, angleAt(e.clientX, e.clientY, cx, cy)));
      if (!spinnable || (r * movedAngle * Math.PI) / 180 < DRAG_THRESHOLD) return;
      c.dragging = true;
      clearHold();
      try {
        surfaceRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      startSpin();
    }

    if (r < MIN_RADIUS) {
      c.lastTime = now; // too close to the center → angle unstable; hold this frame
      return;
    }
    const ang = angleAt(e.clientX, e.clientY, cx, cy);
    const rawD = deltaAngle(c.lastAngle, ang);
    const d = rawD > MAX_STEP_DEG ? MAX_STEP_DEG : rawD < -MAX_STEP_DEG ? -MAX_STEP_DEG : rawD;
    const dt = Math.max(1, now - c.lastTime);
    // +dθ rotates the wheel up ⇒ p decreases. rawP is unclamped; liveP applies the rubber-band.
    c.rawP -= d / spacing;
    c.liveP = rubber(c.rawP);
    c.velA = c.velA * 0.7 + (rawD / dt) * 0.3; // velocity from the UNCLAMPED delta (reach MAX_VEL)
    c.lastAngle = ang;
    c.lastTime = now;
    applyLayout(c.liveP);
  }

  function onPointerUp() {
    const c = g.current;
    if (!c.down) return;
    clearHold();
    const { dragging, pid } = c;
    c.down = false;

    if (dragging) {
      try {
        surfaceRef.current?.releasePointerCapture?.(pid);
      } catch {
        /* no-op */
      }
      c.justDragged = true; // suppress the synthetic background click
      // dragged past a finite end → spring back to the end
      if (!loop && (c.rawP < -0.0001 || c.rawP > maxArc + 0.0001)) {
        settleTo(c.rawP < 0 ? 0 : maxArc);
        return;
      }
      // pausing before lift cancels the fling (iOS behaviour)
      let velP = 0;
      if (performance.now() - c.lastTime < PAUSE_MS) {
        velP = -c.velA / spacing;
        if (velP > MAX_VEL) velP = MAX_VEL;
        else if (velP < -MAX_VEL) velP = -MAX_VEL;
      }
      startMomentum(velP);
      return;
    }
    // a plain tap casts via the <button> onClick (accessible); nothing to do here.
  }

  function startMomentum(velP: number) {
    const c = g.current;
    let last = performance.now();
    let vel = velP;
    const spin = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const next = c.liveP + vel * dt;
      const clamped = clampScroll(n, next);
      if (clamped !== next) {
        c.liveP = clamped; // hit a finite end → settle there (no infinite spin for arcs)
        c.rawP = clamped;
        applyLayout(clamped);
        settleTo(snapScroll(n, clamped));
        return;
      }
      c.liveP = next;
      c.rawP = next;
      vel *= Math.pow(FRICTION, dt / 16);
      applyLayout(next);
      if (Math.abs(vel) > VEL_STOP) {
        raf.current = requestAnimationFrame(spin);
      } else {
        settleTo(snapScroll(n, next));
      }
    };
    raf.current = requestAnimationFrame(spin);
  }

  function settleTo(target: number) {
    const c = g.current;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const f = 1 - Math.exp(-dt / SETTLE_TAU); // framerate-independent critically-damped settle
      c.liveP += (target - c.liveP) * f;
      c.rawP = c.liveP;
      if (Math.abs(target - c.liveP) < 0.004) {
        c.liveP = target;
        c.rawP = target;
        applyLayout(target);
        endSpin();
        props.setScroll(target); // commit the resting position (re-enables the CSS spring)
        return;
      }
      applyLayout(c.liveP);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  /** Cast / descend / open — fired from the glyph <button> (keyboard + VoiceOver reachable). */
  function activate(i: number) {
    const c = g.current;
    if (c.spinning || c.justDragged || c.longFired) {
      c.justDragged = false;
      return;
    }
    const spell = spells[i];
    if (!spell || spell.disabled) return;
    haptic(10);
    if (spell.children?.length) props.enterDetailed(spell);
    else if (spell.opensWindow) props.openWindow(spell.id);
    else props.onCast(spell);
  }

  function onCenter() {
    haptic(8);
    if (center === "back") props.back();
    else if (center === "to-general") props.toGeneral();
    else if (center === "to-suggested") props.toSuggested();
  }

  // only a tap clearly OUTSIDE the ring dismisses — inter-glyph gaps are inert (a near-miss
  // on a spell used to nuke the whole overlay).
  function onSurfaceClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    if (g.current.justDragged) {
      g.current.justDragged = false;
      return;
    }
    const { cx, cy } = center2();
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > RING.R + 48) props.onBackdrop();
  }

  const resting = layoutRing(n, scrollPos);
  const hueClass = hue === "accent" ? "hue-accent" : "hue-gold";
  const scroll = isScroll(n);
  const counts = scroll ? hiddenCounts(resting) : { left: 0, right: 0 };
  const labels = labelGroups(resting); // initial label placement (applyLayout keeps it live)

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
            className={`spell-node${labels.above.has(i) ? " label-above" : ""}${labels.below.has(i) ? " label-below" : ""}`}
            data-index={i}
            style={{
              transform: glyphTransform(pos),
              opacity: pos.opacity,
              ["--bloom-delay" as string]: `${Math.min(Math.abs(pos.angleDeg) * 0.45, 110)}ms`,
            }}
          >
            <div className="spell-bloom">
              <button
                type="button"
                role="menuitem"
                className={`spell-btn ${spellHue}`}
                aria-label={spell.name + (spell.children?.length ? " (has options)" : spell.opensWindow ? " (opens panel)" : "")}
                aria-disabled={spell.disabled || undefined}
                onClick={() => activate(i)}
              >
                <SpellGlyph icon={spell.icon} size={30} />
                {spell.children?.length ? <span className="spell-has-more" aria-hidden="true" /> : null}
                {spell.longPress === "speak" ? <span className="spell-hold-hint" aria-hidden="true" /> : null}
              </button>
            </div>
            <span className="spell-label">{spell.name}</span>
          </div>
        );
      })}

      {/* hidden-count: just the number, updated live in applyLayout; always mounted in scroll
          mode so the live updater has a target (hidden via .is-zero when 0). */}
      {scroll ? (
        <div className={`spell-hidden left${counts.left > 0 ? "" : " is-zero"}`} aria-label="more spells to the left">
          <span className="rh-num">{counts.left}</span>
        </div>
      ) : null}
      {scroll ? (
        <div className={`spell-hidden right${counts.right > 0 ? "" : " is-zero"}`} aria-label="more spells to the right">
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
