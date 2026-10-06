// The "memory thread": a white strand that lives inside every flask, rising through the
// liquid like the wisp in the Pensieve logo. Its shape is a pure function of the note's
// id — the memory's DNA. Same id → the same thread forever; different ids → visibly
// different strands: curly or sharp, narrow or wide, centred or to one side, even or
// top-heavy, short or long. No stored state, no randomness at render time.
//
// We hash the id (xmur3) into a seed, then pull a handful of parameters from a tiny
// deterministic PRNG (mulberry32). The thread is drawn from the body floor up to the
// liquid surface, so it's always over coloured liquid (white reads in both themes) and
// grows with the note's content — "as full as the bottle".

// xmur3: string → 32-bit seed.
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// mulberry32: seed → PRNG producing floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ThreadInput {
  seed: string;
  /** Upper bound (the liquid surface, small y). */
  yTop: number;
  /** Lower bound (the body floor, large y). */
  yBottom: number;
  /** Body centre x on the 0..24 viewBox. */
  cx?: number;
}

export interface Thread {
  /** SVG path `d` for the strand. */
  d: string;
  /** Suggested stroke width (viewBox units). */
  width: number;
}

const f = (n: number) => n.toFixed(2);

/** Build the memory thread for a seed within the vertical band [yTop, yBottom]. */
export function memoryThread({ seed, yTop, yBottom, cx = 12 }: ThreadInput): Thread {
  const rnd = mulberry32(hashSeed(seed));

  const nodes = 3 + Math.floor(rnd() * 5); // 3..7 turning points
  const amp = 1.1 + rnd() * 2.9; // 1.1..4.0 horizontal swing (how wide)
  const bias = (rnd() * 2 - 1) * 2.3; // -2.3..2.3 sideways offset (which side)
  const sharp = rnd(); // 0 smooth .. 1 sharp corners
  const skew = rnd() * 2 - 1; // -1 bottom-heavy .. +1 top-heavy (amplitude envelope)
  const start = rnd() < 0.5 ? 1 : -1; // which way it first leaves the centre
  const width = 1.0 + rnd() * 0.8; // 1.0..1.8 stroke width
  const taper = 0.2 + rnd() * 0.45; // how strongly the ends pull back to centre

  const centerX = cx + bias;
  const span = Math.max(0.0001, yBottom - yTop);
  const peak = 0.5 + 0.38 * skew; // where the swing is widest along the strand

  // Sample the turning points, alternating sides, amplitude shaped by the envelope.
  const pts: [number, number][] = [];
  for (let i = 0; i <= nodes; i++) {
    const t = i / nodes; // 0 at the floor, 1 at the surface
    const y = yBottom - t * span;
    const env = Math.max(0, 1 - Math.abs(t - peak) / Math.max(peak, 1 - peak));
    const side = start * (i % 2 === 0 ? 1 : -1);
    const edge = i === 0 || i === nodes ? taper : 1; // tuck the ends toward centre
    pts.push([centerX + side * amp * env * edge, y]);
  }

  // Sharp strands are a polyline (zigzag); smoother ones are a Catmull-Rom spline whose
  // tension rises as sharpness falls, so low-sharp reads as "super curly" (slight
  // overshoot), mid as a gentle wave.
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  if (sharp > 0.62) {
    for (let i = 1; i < pts.length; i++) d += ` L ${f(pts[i][0])} ${f(pts[i][1])}`;
  } else {
    const k = (1 + (1 - sharp) * 1.6) / 6; // 0.17 (sharp≈0.6) .. 0.43 (sharp=0): curlier
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) * k;
      const c1y = p1[1] + (p2[1] - p0[1]) * k;
      const c2x = p2[0] - (p3[0] - p1[0]) * k;
      const c2y = p2[1] - (p3[1] - p1[1]) * k;
      d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
  }

  return { d, width };
}
