// Waveform amplitude peaks — pure resampling + a best-effort Web-Audio computation.
//
// A recording's full-track amplitude envelope is a small `number[]` in 0..1. We compute
// it once per source (decode → downsample → normalise), cache it in memory, and the
// Waveform component resamples that array to however many bars fit the current width.
// Decode is best-effort: if it fails (unsupported url, decode error), callers fall back
// to a calm placeholder shape so the bar still works.

/** Downsample/upsample a peaks array to exactly `n` bars by max-pooling each bucket
 *  (peaks represent amplitude, so max preserves transients better than averaging). */
export function resamplePeaks(peaks: number[], n: number): number[] {
  if (n <= 0) return [];
  if (!peaks.length) return new Array(n).fill(0);
  if (peaks.length === n) return peaks.slice();
  const out = new Array<number>(n);
  const step = peaks.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      const v = peaks[j];
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

/** A calm, deterministic placeholder envelope (stable per key) for before/instead-of a
 *  real decode — looks like a waveform, never empty, same every render for a given source. */
export function placeholderPeaks(key: string, n = 400): number[] {
  // Cheap seeded hash → pseudo-random but deterministic per key.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = new Array<number>(n);
  let s = h >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const r = s / 0xffffffff;
    // Gentle rolling envelope so it reads as speech-like, floored so silence still ticks.
    const env = 0.35 + 0.4 * Math.abs(Math.sin(i / 7) * Math.cos(i / 23));
    out[i] = Math.min(1, 0.12 + env * (0.55 + r * 0.45));
  }
  return out;
}

const cache = new Map<string, number[]>();

/** Already-computed peaks for a source, if any (sync). */
export function cachedPeaks(src: string): number[] | undefined {
  return cache.get(src);
}

type WebAudioWindow = typeof globalThis & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

/** Decode an audio url and reduce it to `bars` normalised peaks (0..1). Best-effort:
 *  resolves to null on any failure. Result is cached by `src`. Heavy for long files
 *  (decodes the whole clip once) — callers should show a placeholder meanwhile. */
export async function computePeaks(src: string, bars = 800): Promise<number[] | null> {
  const hit = cache.get(src);
  if (hit) return hit;
  try {
    const w = globalThis as WebAudioWindow;
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return null;
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buf);
      const ch = audio.getChannelData(0);
      const block = Math.max(1, Math.floor(ch.length / bars));
      const raw = new Array<number>(bars);
      let max = 0;
      for (let i = 0; i < bars; i++) {
        const start = i * block;
        let peak = 0;
        for (let j = start; j < start + block && j < ch.length; j++) {
          const v = Math.abs(ch[j]);
          if (v > peak) peak = v;
        }
        raw[i] = peak;
        if (peak > max) max = peak;
      }
      const norm = max > 0 ? raw.map((v) => Math.min(1, v / max)) : raw;
      cache.set(src, norm);
      return norm;
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}
