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
const KAPPA = 0.5522847498; // circle-arc control-point constant

type Pt = [number, number];

// A full loop (an "O" twist) that starts and ends at P, bulging to one side so the pen
// returns exactly where it began and the strand can carry on. side +1 bulges right (P is
// the circle's left point), -1 bulges left.
function loopPath(px: number, py: number, r: number, side: number): string {
  const cx = px + r * side;
  const cy = py;
  const k = KAPPA * r;
  if (side >= 0) {
    // P = left point; traverse left → top → right → bottom → left.
    return (
      `C ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} ` +
      `C ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} ` +
      `C ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} ` +
      `C ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(px)} ${f(py)}`
    );
  }
  // P = right point; traverse right → top → left → bottom → right.
  return (
    `C ${f(cx + r)} ${f(cy - k)} ${f(cx + k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} ` +
    `C ${f(cx - k)} ${f(cy - r)} ${f(cx - r)} ${f(cy - k)} ${f(cx - r)} ${f(cy)} ` +
    `C ${f(cx - r)} ${f(cy + k)} ${f(cx - k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} ` +
    `C ${f(cx + k)} ${f(cy + r)} ${f(cx + r)} ${f(cy + k)} ${f(px)} ${f(py)}`
  );
}

/** Build the memory thread for a seed within the vertical band [yTop, yBottom]. The
 *  strand mixes styles *within itself* — some segments sharp, some round, some wiggly,
 *  with the occasional loop — so no two reads as one repeating pattern. */
export function memoryThread({ seed, yTop, yBottom, cx = 12 }: ThreadInput): Thread {
  const rnd = mulberry32(hashSeed(seed));

  const nodes = 4 + Math.floor(rnd() * 4); // 4..7 turning points (enough for variety)
  const ampBase = 1.2 + rnd() * 2.6; // overall horizontal swing (how wide)
  const bias = (rnd() * 2 - 1) * 2.1; // sideways offset (which side)
  const skew = rnd() * 2 - 1; // -1 bottom-heavy .. +1 top-heavy (amplitude envelope)
  const start = rnd() < 0.5 ? 1 : -1; // which way it first leaves the centre
  const width = 1.0 + rnd() * 0.7; // stroke width
  const taper = 0.2 + rnd() * 0.4; // how strongly the ends pull back to centre
  const loopChance = 0.1 + rnd() * 0.32; // some strands loopy, some not

  const centerX = cx + bias;
  const span = Math.max(0.0001, yBottom - yTop);
  const peak = 0.5 + 0.35 * skew;

  // Turning points: alternating sides, amplitude shaped by the envelope and jittered
  // per node so the swing is uneven (not a tidy sine).
  const pts: Pt[] = [];
  for (let i = 0; i <= nodes; i++) {
    const t = i / nodes; // 0 at the floor, 1 at the surface
    const y = yBottom - t * span;
    const env = Math.max(0, 1 - Math.abs(t - peak) / Math.max(peak, 1 - peak));
    const jitter = 0.55 + rnd() * 0.85; // 0.55..1.4
    const side = start * (i % 2 === 0 ? 1 : -1);
    const edge = i === 0 || i === nodes ? taper : 1; // tuck the ends toward centre
    pts.push([centerX + side * ampBase * env * edge * jitter, y]);
  }

  // Pick an independent style per segment (sharp line / round curve / wiggly S) and a
  // loop flag per interior node — this is what breaks the regularity.
  const styles: ("line" | "curve" | "wiggle")[] = [];
  const loops: boolean[] = [];
  for (let i = 0; i < nodes; i++) {
    const r = rnd();
    styles.push(r < 0.3 ? "line" : r < 0.62 ? "wiggle" : "curve");
    loops.push(false);
  }
  loops.push(false);
  for (let i = 1; i < nodes; i++) loops[i] = rnd() < loopChance;

  const K = 0.42; // curl tension for round segments (strong → curly)
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < nodes; i++) {
    if (loops[i]) {
      const r = 0.8 + rnd() * 1.2; // loop radius
      const side = i % 2 === 0 ? start : -start; // bulge to the swinging side
      d += ` ${loopPath(pts[i][0], pts[i][1], r, side)}`;
    }
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    if (styles[i] === "line") {
      d += ` L ${f(p2[0])} ${f(p2[1])}`;
    } else if (styles[i] === "curve") {
      const c1x = p1[0] + (p2[0] - p0[0]) * K;
      const c1y = p1[1] + (p2[1] - p0[1]) * K;
      const c2x = p2[0] - (p3[0] - p1[0]) * K;
      const c2y = p2[1] - (p3[1] - p1[1]) * K;
      d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    } else {
      // Wiggle: an S inside the segment — control points thrown to opposite sides of
      // the chord along its perpendicular.
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const off = 1.1 + rnd() * 1.6;
      const c1x = p1[0] + dx * 0.25 + nx * off;
      const c1y = p1[1] + dy * 0.25 + ny * off;
      const c2x = p1[0] + dx * 0.75 - nx * off;
      const c2y = p1[1] + dy * 0.75 - ny * off;
      d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
  }

  return { d, width };
}
