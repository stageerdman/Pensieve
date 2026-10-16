import { useEffect, useRef, useState } from "react";
import type { AudioController } from "../../lib/audio/controller";
import { resamplePeaks, cachedPeaks, computePeaks, placeholderPeaks } from "../../lib/audio/peaks";

// The amplitude visualization + scrub surface. Pure presentation: it draws `peaks` to a
// canvas (played vs unplayed vs playhead, from design tokens), and turns pointer gestures
// into controller seeks. No playback logic here — that's the shared controller.
//
// Colours are read from CSS custom properties so light/dark + the one-accent rule are
// honoured automatically (no hardcoded hex).

interface Props {
  controller: AudioController;
  /** Loadable url used to compute real peaks lazily; falls back to a placeholder. */
  peaksSrc?: string;
  /** Explicit peaks (0..1) — if given, used directly (skips computation). */
  peaks?: number[];
  compact?: boolean;
  label?: string;
}

const BAR_W = 2;
const GAP = 1; // → 3px pitch
const MIN = 0.12; // amplitude floor so a silent bar still shows a tick

function cssColor(el: HTMLElement, varName: string, alpha = 1): string {
  const v = getComputedStyle(el).getPropertyValue(varName).trim();
  return v ? `hsl(${v} / ${alpha})` : `rgba(127,127,127,${alpha})`;
}

export function Waveform({ controller, peaksSrc, peaks: explicit, compact, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[]>(
    () => explicit ?? (peaksSrc ? cachedPeaks(peaksSrc) : undefined) ?? placeholderPeaks(peaksSrc ?? controller.src),
  );
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  // Lazily compute real peaks (best-effort) and swap them in when ready.
  useEffect(() => {
    if (explicit || !peaksSrc) return;
    let alive = true;
    void computePeaks(peaksSrc).then((p) => {
      if (alive && p) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [peaksSrc, explicit]);

  // Draw on every time/seek/resize; resample peaks to the bar count that fits the width.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pitch = BAR_W + GAP;
      const n = Math.max(1, Math.floor(w / pitch));
      const bars = resamplePeaks(peaks, n);
      const dur = controller.duration;
      const progress = Number.isFinite(dur) && dur > 0 ? controller.currentTime / dur : 0;
      const playedBars = Math.round(progress * n);

      const played = cssColor(wrap, "--accent", 1);
      const head = cssColor(wrap, "--accent-glow", 1);
      const unplayed = cssColor(wrap, "--text-muted", 0.35);
      const hover = cssColor(wrap, "--accent", 0.55);
      const mid = h / 2;

      for (let i = 0; i < n; i++) {
        const amp = Math.max(MIN, bars[i]);
        const barH = Math.max(1, amp * h);
        const x = i * pitch;
        ctx.fillStyle = i < playedBars ? played : unplayed;
        if (i === playedBars) ctx.fillStyle = head;
        const r = Math.min(1.5, BAR_W / 2);
        const y = mid - barH / 2;
        // rounded-cap bar (roundRect is widely supported; fall back to rect if absent)
        const rr = (ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
        ctx.beginPath();
        if (rr) rr.call(ctx, x, y, BAR_W, barH, r);
        else ctx.rect(x, y, BAR_W, barH);
        ctx.fill();
      }

      if (hoverFrac != null) {
        ctx.fillStyle = hover;
        ctx.fillRect(Math.round(hoverFrac * w), 0, 1, h);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    const offT = controller.on("time", draw);
    const offS = controller.on("seek", draw);
    const offD = controller.on("durationchange", draw);
    return () => {
      ro.disconnect();
      offT();
      offS();
      offD();
    };
  }, [controller, peaks, hoverFrac]);

  const fracFromEvent = (e: React.PointerEvent): number => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  return (
    <div
      ref={wrapRef}
      className={"pensieve-audio-wave" + (compact ? " is-compact" : "")}
      role="slider"
      aria-label={label ?? "Seek"}
      aria-valuemin={0}
      aria-valuemax={Math.round(Number.isFinite(controller.duration) ? controller.duration : 0)}
      aria-valuenow={Math.round(controller.currentTime)}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        controller.seekFrac(fracFromEvent(e));
      }}
      onPointerMove={(e) => {
        const f = fracFromEvent(e);
        setHoverFrac(f);
        if (e.buttons === 1) controller.seekFrac(f);
      }}
      onPointerLeave={() => setHoverFrac(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") controller.seek(controller.currentTime - 5);
        else if (e.key === "ArrowRight") controller.seek(controller.currentTime + 5);
        else return;
        e.preventDefault();
      }}
    >
      <canvas ref={canvasRef} className="pensieve-audio-canvas" />
    </div>
  );
}
