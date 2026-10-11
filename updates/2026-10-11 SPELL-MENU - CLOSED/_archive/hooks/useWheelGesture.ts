// useWheelGesture.ts — the thumb-WHEEL: the buttons ARE the drag handles.
//
// Ported from 01-the-wand-v2.html ~1043-1340 (the whole `wheelEngine` IIFE). Grab a
// button and swing it around the arc to rotate (inertial glide + detent on release);
// a short radial INWARD flick sucks the wheel into the lone wand (collapse), an
// OUTWARD flick springs it back. Tap a button to run it in place. The "Adjust" grip
// (live only when Adjust is centred) resizes (radial drag), flips side (hold ~2s), or
// rotates (tangential drag).
//
// HARD constraint #1: the rAF loop writes transform/opacity DIRECTLY to the button
// nodes via refs — never through React state. The pure springs live in
// lib/wand/wheelPhysics; the tunables in lib/wand/constants. This hook is the
// imperative wiring (one useEffect = the prototype's IIFE scope).

import { useEffect, useRef } from "react";
import {
  CENTER_R,
  COLLAPSE_R,
  COLLAPSE_SPAN,
  FLICK_DIST,
  FLICK_VEL,
  FLIP_MS,
  HOLD_MS,
  MAX_VIS,
  PEND_PX,
  R_MAX,
  R_MIN,
  STEP_DEG,
  TAP_DEG,
} from "../lib/wand/constants";
import {
  clampRotationVelocity,
  isCollapseAtRest,
  isRotationAtRest,
  stepCollapseSpring,
  stepRotationSpring,
  wrap,
} from "../lib/wand/wheelPhysics";
import { haptic } from "../util";

/** Button order around the arc; `wand` is the centred HERO. Source ~1075-1077. */
export const ORDER = ["adjust", "accio", "wand", "sync"] as const;
export type WheelKey = (typeof ORDER)[number];
export const LABELS: Record<WheelKey, string> = { accio: "Accio", wand: "New", sync: "Sync", adjust: "Adjust" };
const HERO: WheelKey = "wand";

// Layout geometry not in constants.ts (wheel-local). Source ~1046.
const HUB_RIGHT = 6,
  HUB_BOTTOM = 30,
  LABEL_DROP = 46;
const DEG = Math.PI / 180;

export interface WheelRefs {
  rootRef: React.RefObject<HTMLElement>;
  wheelRef: React.RefObject<HTMLElement>;
  labelRef: React.RefObject<HTMLElement>;
  gripRef: React.RefObject<HTMLElement>;
  gripFillRef: React.RefObject<SVGCircleElement>;
  designRef: React.RefObject<SVGElement>;
  designNumRef: React.RefObject<HTMLElement>;
  dRingRef: React.RefObject<SVGCircleElement>;
  dSpokeRef: React.RefObject<SVGLineElement>;
  dDotRef: React.RefObject<SVGCircleElement>;
}

export interface WheelCallbacks {
  /** A seat was tapped (run in place): wand/accio/sync. Source ~1192-1197. */
  onAction: (key: WheelKey) => void;
  /** A seat was long-pressed while centred: wand (dictate) / sync (panel). ~1187-1190. */
  onLongPress: (key: WheelKey) => void;
  /** Side flipped (persisted) — the app mirrors `.side-left` onto the root. */
  onSideChange: (side: "left" | "right") => void;
}

export interface WheelHandle {
  refresh: () => void;
  collapse: () => void;
  expand: () => void;
}

const store = {
  get(k: string, d: string): string {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export function initialWheelSide(): "left" | "right" {
  return store.get("pensieve.wheelSide", "right") === "left" ? "left" : "right";
}

export function useWheelGesture(refs: WheelRefs, cb: WheelCallbacks): WheelHandle {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const handle = useRef<WheelHandle>({ refresh: () => {}, collapse: () => {}, expand: () => {} });

  useEffect(() => {
    const root = refs.rootRef.current;
    const wheel = refs.wheelRef.current;
    const wheelLabel = refs.labelRef.current;
    const grip = refs.gripRef.current;
    const gripFill = refs.gripFillRef.current;
    const design = refs.designRef.current;
    const designNum = refs.designNumRef.current;
    const dRing = refs.dRingRef.current;
    const dSpoke = refs.dSpokeRef.current;
    const dDot = refs.dDotRef.current;
    if (!root || !wheel || !wheelLabel || !grip) return;

    const N = ORDER.length;
    let side: "left" | "right" = initialWheelSide();
    let RADIUS = Math.max(R_MIN, Math.min(R_MAX, parseFloat(store.get("pensieve.wheelRadius", "150")) || 150));

    // map the rendered .wact buttons by their data-key
    const els: Record<string, HTMLElement> = {};
    wheel.querySelectorAll<HTMLElement>(".wact").forEach((el) => {
      const k = el.dataset.key;
      if (k) els[k] = el;
    });

    let W = 0,
      H = 0,
      pivotX = 0,
      pivotY = 0,
      sRect: DOMRect | null = null;
    const applySide = () => cbRef.current.onSideChange(side);
    function cacheGeom() {
      sRect = root!.getBoundingClientRect();
      W = sRect.width;
      H = sRect.height;
      pivotX = side === "right" ? W - HUB_RIGHT : HUB_RIGHT;
      pivotY = H - HUB_BOTTOM;
    }
    const centerDeg = () => (side === "right" ? CENTER_R : 180 - CENTER_R);
    const sideSign = () => (side === "right" ? 1 : -1);
    function angleDeg(clientX: number, clientY: number) {
      const lx = clientX - sRect!.left - pivotX,
        ly = pivotY - (clientY - sRect!.top);
      return Math.atan2(ly, lx) / DEG;
    }

    let pos = ORDER.indexOf("wand"),
      vel = 0,
      lastCentered = -1;
    let collapseT = 0,
      collapseV = 0,
      collapseTarget = 0,
      collapseDragging = false;
    let rotTarget: number | null = null;
    const centredIndex = () => ((Math.round(pos) % N) + N) % N;
    const centredKey = () => ORDER[centredIndex()];
    const settled = () => Math.abs(pos - Math.round(pos)) < 0.22;

    function layoutArc() {
      const C = centerDeg(),
        sgn = sideSign(),
        t = collapseT,
        tC = Math.max(0, Math.min(1, t));
      const ca = C * DEG;
      const ccx = pivotX + COLLAPSE_R * Math.cos(ca),
        ccy = pivotY - COLLAPSE_R * Math.sin(ca);
      for (let i = 0; i < N; i++) {
        const key = ORDER[i],
          el = els[key],
          isHero = key === HERO;
        if (!el) continue;
        const o = wrap(i - pos, N),
          ao = Math.abs(o),
          farHidden = ao > MAX_VIS;
        if (farHidden && t < 0.001 && !isHero) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          continue;
        }
        const ang = (C + sgn * o * STEP_DEG) * DEG;
        const ex = pivotX + RADIUS * Math.cos(ang),
          ey = pivotY - RADIUS * Math.sin(ang);
        const escale = Math.max(0.52, 1 - 0.24 * ao),
          eop = farHidden ? 0 : Math.max(0, 1 - 0.42 * ao);
        const x = ex + (ccx - ex) * t,
          y = ey + (ccy - ey) * t;
        let scale: number, op: number, z: number, pe: string;
        if (isHero) {
          scale = escale + (1 - escale) * t;
          op = Math.max(0, Math.min(1, eop + (1 - eop) * t));
          z = 110 + Math.round(tC * 40);
          pe = op > 0.25 ? "auto" : "none";
        } else {
          op = Math.max(0, eop * (1 - tC));
          scale = escale * (1 - 0.4 * tC);
          z = 100 - Math.round(ao * 10);
          pe = op > 0.25 && tC < 0.5 ? "auto" : "none";
        }
        el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${scale})`;
        el.style.opacity = String(op);
        el.style.zIndex = String(z);
        el.style.pointerEvents = pe;
        el.classList.toggle("centered", (ao < 0.5 && tC < 0.5) || (isHero && tC > 0.5));
      }
      const cx = pivotX + RADIUS * Math.cos(ca),
        cy = pivotY - RADIUS * Math.sin(ca);
      wheelLabel!.style.transform = `translate3d(${cx}px,${cy + LABEL_DROP}px,0) translate(-50%,-50%)`;
      wheelLabel!.textContent = LABELS[centredKey()];
      const wheelHidden = root!.classList.contains("searching") || root!.classList.contains("kb-open");
      wheelLabel!.style.opacity = !wheelHidden && settled() && tC < 0.05 ? "1" : "0";
      const gx = cx + (ccx - cx) * t,
        gy = cy + (ccy - cy) * t;
      grip!.style.transform = `translate3d(${gx}px,${gy}px,0) translate(-50%,-50%)`;
      grip!.classList.toggle("live", centredKey() === "adjust" && Math.abs(pos - Math.round(pos)) < 0.3 && tC < 0.05);
      const ci = centredIndex();
      if (ci !== lastCentered) {
        lastCentered = ci;
        if (settled()) haptic(6);
      }
    }

    /* ---- inertia loop ---- */
    let running = false,
      lastT = 0,
      raf: number | null = null;
    function wake() {
      if (running) return;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }
    function frame(now: number) {
      if (!running) return;
      let dt = (now - lastT) / 1000;
      lastT = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 60;
      const target = rotTarget == null ? Math.round(pos) : rotTarget;
      const r = stepRotationSpring({ pos, vel }, target, dt);
      pos = r.pos;
      vel = r.vel;
      let colRest = true;
      if (!collapseDragging) {
        const c = stepCollapseSpring({ t: collapseT, v: collapseV }, collapseTarget, dt);
        collapseT = c.t;
        collapseV = c.v;
        colRest = isCollapseAtRest({ t: collapseT, v: collapseV }, collapseTarget);
      } else {
        colRest = false;
      }
      layoutArc();
      const rotRest = isRotationAtRest({ pos, vel }, target);
      if (rotRest && colRest) {
        pos = target;
        vel = 0;
        collapseT = collapseTarget;
        collapseV = 0;
        if (collapseTarget === 0) rotTarget = null;
        running = false;
        layoutArc();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    /* ---- grab a button → rotate / collapse; tap → run ---- */
    interface Drag {
      key: WheelKey;
      mode: "pending" | "rotate" | "radial";
      A0: number;
      lastA: number;
      R0: number;
      lastR: number;
      startT: number;
      movedDeg: number;
      lastPos: number;
      lastT: number;
      radV: number;
      committed: boolean;
    }
    let drag: Drag | null = null,
      holdTimer: ReturnType<typeof setTimeout> | null = null,
      heldFired = false;
    const isCentred = (key: WheelKey) => centredKey() === key && settled();
    function startHold(key: WheelKey) {
      if (holdTimer) clearTimeout(holdTimer);
      heldFired = false;
      holdTimer = setTimeout(() => {
        if (drag && drag.movedDeg < TAP_DEG) {
          heldFired = true;
          els[key]?.classList.add("holding");
          flash(key);
          haptic(16);
          cbRef.current.onLongPress(key);
        }
      }, HOLD_MS);
    }
    function flash(key: WheelKey) {
      const el = els[key];
      if (!el) return;
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
    function execAction(key: WheelKey) {
      if (key === "adjust") return; // Adjust is driven by its grip, not a tap
      flash(key);
      haptic(10);
      cbRef.current.onAction(key);
    }
    const wandRotTarget = () => pos + wrap(ORDER.indexOf(HERO) - pos, N);
    function fingerR(cx: number, cy: number) {
      return Math.hypot(cx - sRect!.left - pivotX, cy - sRect!.top - pivotY);
    }

    function onBtnDown(e: PointerEvent) {
      const el = e.currentTarget as HTMLElement;
      const key = el.dataset.key as WheelKey;
      const now = e.timeStamp || performance.now();
      cacheGeom();
      stopLoop();
      const a = angleDeg(e.clientX, e.clientY),
        r = fingerR(e.clientX, e.clientY);
      drag = {
        key,
        mode: "pending",
        A0: a,
        lastA: a,
        R0: r,
        lastR: r,
        startT: collapseT,
        movedDeg: 0,
        lastPos: pos,
        lastT: now,
        radV: 0,
        committed: false,
      };
      vel = 0;
      heldFired = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      e.preventDefault();
      e.stopPropagation();
      if ((key === "wand" || key === "sync") && isCentred(key)) startHold(key);
    }
    function onBtnMove(e: PointerEvent) {
      if (!drag) return;
      e.preventDefault();
      const A = angleDeg(e.clientX, e.clientY),
        curR = fingerR(e.clientX, e.clientY);
      const now = e.timeStamp || performance.now();
      let dt = (now - drag.lastT) / 1000;
      if (dt <= 0) dt = 1 / 60;
      let d = A - drag.lastA;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      drag.movedDeg += Math.abs(d);
      const dRad = curR - drag.R0;
      drag.radV = drag.radV * 0.6 + ((curR - drag.lastR) / dt) * 0.4;
      if ((drag.movedDeg > TAP_DEG || Math.abs(dRad) > 3) && holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (drag.mode === "pending") {
        let da = A - drag.A0;
        while (da > 180) da -= 360;
        while (da < -180) da += 360;
        const arc = da * DEG * drag.R0;
        if (Math.max(Math.abs(dRad), Math.abs(arc)) > PEND_PX) {
          if (Math.abs(dRad) >= Math.abs(arc) || drag.startT > 0.5) {
            drag.mode = "radial";
            collapseDragging = true;
          } else {
            drag.mode = "rotate";
          }
          drag.lastPos = pos;
        }
      }
      if (drag.mode === "rotate") {
        pos += -d / (sideSign() * STEP_DEG);
        vel = vel * 0.6 + ((pos - drag.lastPos) / dt) * 0.4;
        drag.lastPos = pos;
        layoutArc();
      } else if (drag.mode === "radial" && !drag.committed) {
        collapseT = Math.max(0, Math.min(1, drag.startT + -dRad / COLLAPSE_SPAN));
        const opening = drag.startT < 0.5;
        const closeDist = opening ? -dRad : dRad;
        const closeVel = opening ? -drag.radV : drag.radV;
        if (closeDist > FLICK_DIST || closeVel > FLICK_VEL) {
          drag.committed = true;
          collapseDragging = false;
          collapseTarget = opening ? 1 : 0;
          rotTarget = collapseTarget === 1 ? wandRotTarget() : null;
          collapseV = -drag.radV / COLLAPSE_SPAN;
          wake();
        } else {
          layoutArc();
        }
      }
      drag.lastA = A;
      drag.lastR = curR;
      drag.lastT = now;
    }
    function onBtnUp() {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      els[d.key]?.classList.remove("holding");
      if (heldFired) {
        heldFired = false;
        wake();
        return;
      }
      if (d.mode === "radial") {
        collapseDragging = false;
        if (!d.committed) {
          collapseTarget = collapseT > 0.5 ? 1 : 0;
          rotTarget = collapseTarget === 1 ? wandRotTarget() : null;
          collapseV = -d.radV / COLLAPSE_SPAN;
        }
        wake();
        return;
      }
      if (d.mode === "rotate") {
        vel = clampRotationVelocity(vel);
        wake();
        return;
      }
      if (d.movedDeg < TAP_DEG) {
        vel = 0;
        execAction(d.key);
        wake();
        return;
      }
      wake();
    }
    ORDER.forEach((key) => {
      const el = els[key];
      if (!el) return;
      el.addEventListener("pointerdown", onBtnDown as EventListener);
      el.addEventListener("pointermove", onBtnMove as EventListener);
      el.addEventListener("pointerup", onBtnUp as EventListener);
      el.addEventListener("pointercancel", onBtnUp as EventListener);
    });

    /* ---- the adjust grip ---- */
    let gDrag = false,
      gMode = "",
      gA0 = 0,
      gR0 = 0,
      gLastA = 0,
      gLastPos = 0,
      gLastT = 0,
      flipRAF: number | null = null,
      flipFired = false;
    const setFill = (p: number) => {
      if (gripFill) gripFill.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, p)));
    };
    function resetFill() {
      if (flipRAF) cancelAnimationFrame(flipRAF);
      flipRAF = null;
      setFill(0);
      grip!.classList.remove("holding");
    }
    function startFlipFill() {
      flipFired = false;
      grip!.classList.add("holding");
      const begin = performance.now();
      if (flipRAF) cancelAnimationFrame(flipRAF);
      (function tick(now: number) {
        if (gMode !== "pending") return;
        const p = Math.min(1, (now - begin) / FLIP_MS);
        setFill(p);
        if (p >= 1) {
          if (!flipFired) {
            flipFired = true;
            doFlip();
          }
          return;
        }
        flipRAF = requestAnimationFrame(tick);
      })(begin);
    }
    function doFlip() {
      side = side === "right" ? "left" : "right";
      store.set("pensieve.wheelSide", side);
      haptic(30);
      applySide();
      cacheGeom();
      layoutArc();
      resetFill();
    }
    function showDesign(on: boolean) {
      design?.classList.toggle("on", on);
      designNum?.classList.toggle("on", on);
    }
    function paintDesign(cx: number, cy: number) {
      let r = fingerR(cx, cy);
      r = Math.max(R_MIN, Math.min(R_MAX, r));
      RADIUS = r;
      dRing?.setAttribute("cx", String(pivotX));
      dRing?.setAttribute("cy", String(pivotY));
      dRing?.setAttribute("r", String(r));
      const ca = centerDeg() * DEG,
        ex = pivotX + r * Math.cos(ca),
        ey = pivotY - r * Math.sin(ca);
      dSpoke?.setAttribute("x1", String(pivotX));
      dSpoke?.setAttribute("y1", String(pivotY));
      dSpoke?.setAttribute("x2", String(ex));
      dSpoke?.setAttribute("y2", String(ey));
      dDot?.setAttribute("cx", String(ex));
      dDot?.setAttribute("cy", String(ey));
      if (designNum) {
        designNum.style.left = ex + "px";
        designNum.style.top = ey - 24 + "px";
        designNum.textContent = Math.round(r) + " px";
      }
      layoutArc();
    }
    function onGripDown(e: PointerEvent) {
      if (!grip!.classList.contains("live")) return;
      e.preventDefault();
      e.stopPropagation();
      cacheGeom();
      stopLoop();
      gDrag = true;
      gMode = "pending";
      gA0 = angleDeg(e.clientX, e.clientY);
      gR0 = fingerR(e.clientX, e.clientY);
      gLastA = gA0;
      gLastPos = pos;
      gLastT = e.timeStamp || performance.now();
      vel = 0;
      try {
        grip!.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      startFlipFill();
    }
    function onGripMove(e: PointerEvent) {
      if (!gDrag) return;
      e.preventDefault();
      const A = angleDeg(e.clientX, e.clientY),
        curR = fingerR(e.clientX, e.clientY),
        now = e.timeStamp || performance.now();
      if (gMode === "pending") {
        const dRad = curR - gR0;
        let da = A - gA0;
        while (da > 180) da -= 360;
        while (da < -180) da += 360;
        const arc = da * DEG * gR0;
        if (Math.max(Math.abs(dRad), Math.abs(arc)) > 8) {
          resetFill();
          if (Math.abs(dRad) >= Math.abs(arc)) {
            gMode = "resize";
            showDesign(true);
          } else {
            gMode = "rotate";
            gLastA = A;
            gLastPos = pos;
            gLastT = now;
          }
        }
      }
      if (gMode === "resize") {
        paintDesign(e.clientX, e.clientY);
      } else if (gMode === "rotate") {
        let d = A - gLastA;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        gLastA = A;
        pos += -d / (sideSign() * STEP_DEG);
        let dt = (now - gLastT) / 1000;
        if (dt <= 0) dt = 1 / 60;
        vel = vel * 0.6 + ((pos - gLastPos) / dt) * 0.4;
        gLastPos = pos;
        gLastT = now;
        layoutArc();
      }
    }
    function gripEnd(e: PointerEvent) {
      if (!gDrag) return;
      gDrag = false;
      try {
        grip!.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      if (gMode === "resize") {
        showDesign(false);
        store.set("pensieve.wheelRadius", String(Math.round(RADIUS)));
        layoutArc();
      } else if (gMode === "rotate") {
        vel = clampRotationVelocity(vel);
        resetFill();
        gMode = "";
        wake();
        return;
      }
      resetFill();
      gMode = "";
    }
    grip.addEventListener("pointerdown", onGripDown as EventListener);
    grip.addEventListener("pointermove", onGripMove as EventListener);
    grip.addEventListener("pointerup", gripEnd as EventListener);
    grip.addEventListener("pointercancel", gripEnd as EventListener);

    /* ---- boot ---- */
    function setCollapsed(on: boolean) {
      collapseTarget = on ? 1 : 0;
      rotTarget = on ? wandRotTarget() : null;
      collapseV = 0;
      wake();
    }
    handle.current.refresh = () => layoutArc();
    handle.current.collapse = () => setCollapsed(true);
    handle.current.expand = () => setCollapsed(false);

    function boot() {
      applySide();
      cacheGeom();
      pos = ORDER.indexOf("wand");
      vel = 0;
      setFill(0);
      layoutArc();
    }
    const bootRAF = requestAnimationFrame(boot);
    const onResize = () => {
      cacheGeom();
      layoutArc();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(bootRAF);
      stopLoop();
      if (holdTimer) clearTimeout(holdTimer);
      if (flipRAF) cancelAnimationFrame(flipRAF);
      window.removeEventListener("resize", onResize);
      ORDER.forEach((key) => {
        const el = els[key];
        if (!el) return;
        el.removeEventListener("pointerdown", onBtnDown as EventListener);
        el.removeEventListener("pointermove", onBtnMove as EventListener);
        el.removeEventListener("pointerup", onBtnUp as EventListener);
        el.removeEventListener("pointercancel", onBtnUp as EventListener);
      });
      grip.removeEventListener("pointerdown", onGripDown as EventListener);
      grip.removeEventListener("pointermove", onGripMove as EventListener);
      grip.removeEventListener("pointerup", gripEnd as EventListener);
      grip.removeEventListener("pointercancel", gripEnd as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return handle.current;
}
