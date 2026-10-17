import { resamplePeaks } from "./peaks";

// The one canvas routine that paints the amplitude bars — shared by the playback Waveform
// and the live recording bar so both read as the exact same waveform (one bar, everywhere).
// Pure drawing: the caller owns the canvas, its dpr transform, clearing, and colour tokens
// (read from CSS so light/dark + the one-accent rule are honoured upstream). Coordinates are
// in CSS pixels — set the dpr transform before calling.

export interface WaveformColors {
  /** bars left of the playhead (the "played"/captured accent) */
  played: string;
  /** the single bar at the playhead */
  head: string;
  /** bars right of the playhead (not yet played) */
  unplayed: string;
}

export interface PaintWaveformOpts {
  width: number;
  height: number;
  peaks: number[];
  /** 0..1 — fraction drawn in the played colour (recording passes 1: all captured). */
  playedFrac: number;
  colors: WaveformColors;
  barW?: number;
  gap?: number;
  /** amplitude floor so a silent bar still shows a tick */
  min?: number;
}

type RoundRectCtx = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
};

export function paintWaveform(ctx: CanvasRenderingContext2D, o: PaintWaveformOpts): void {
  const barW = o.barW ?? 2;
  const gap = o.gap ?? 1;
  const min = o.min ?? 0.12;
  const pitch = barW + gap;
  const n = Math.max(1, Math.floor(o.width / pitch));
  const bars = resamplePeaks(o.peaks, n);
  const frac = Math.max(0, Math.min(1, o.playedFrac));
  const playedBars = Math.round(frac * n);
  const mid = o.height / 2;
  const r = Math.min(1.5, barW / 2);
  const rr = (ctx as RoundRectCtx).roundRect;

  for (let i = 0; i < n; i++) {
    const amp = Math.max(min, bars[i]);
    const barH = Math.max(1, amp * o.height);
    const x = i * pitch;
    ctx.fillStyle = i < playedBars ? o.colors.played : o.colors.unplayed;
    if (i === playedBars) ctx.fillStyle = o.colors.head;
    const y = mid - barH / 2;
    // rounded-cap bar (roundRect is widely supported; fall back to rect if absent)
    ctx.beginPath();
    if (rr) rr.call(ctx, x, y, barW, barH, r);
    else ctx.rect(x, y, barW, barH);
    ctx.fill();
  }
}
