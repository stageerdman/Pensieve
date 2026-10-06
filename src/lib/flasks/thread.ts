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

type Pt = [number, number];

// A cursive loop that the strand flows *through*: it starts and ends at P, with entry and
// exit tangents aligned to the travel direction (ux,uy), so it reads like a handwriting
// loop that curls and crosses itself — not a circle bolted onto the side. The loop is an
// ellipse built in a local frame (x = travel, y = perpendicular), offset to one `side`,
// then mapped back to world. `aspect` squashes it (rounder ↔ teardrop), `dir` is the
// winding. Four cubic quarter-arcs, so it stays smooth.
function loopPath(
  px: number,
  py: number,
  ux: number,
  uy: number,
  r: number,
  aspect: number,
  side: number,
  dir: number,
): string {
  const nx = -uy; // perpendicular to travel
  const ny = ux;
  const rx = r; // radius along travel
  const ry = r * aspect; // radius across travel
  const cy = side * ry; // ellipse centre in local frame (P sits on its rim)
  const phi0 = -side * (Math.PI / 2); // local angle of P (tangent there = travel dir)
  const delta = dir * (Math.PI / 2);
  const k = (4 / 3) * Math.tan(delta / 4); // cubic-arc control factor
  const toWorld = (lx: number, ly: number): Pt => [px + lx * ux + ly * nx, py + lx * uy + ly * ny];

  let out = "";
  let a = phi0;
  for (let q = 0; q < 4; q++) {
    const b = a + delta;
    const p1 = toWorld(rx * Math.cos(a) + k * -rx * Math.sin(a), cy + ry * Math.sin(a) + k * ry * Math.cos(a));
    const p2 = toWorld(rx * Math.cos(b) - k * -rx * Math.sin(b), cy + ry * Math.sin(b) - k * ry * Math.cos(b));
    const e = toWorld(rx * Math.cos(b), cy + ry * Math.sin(b));
    out += `C ${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(e[0])} ${f(e[1])} `;
    a = b;
  }
  return out.trim();
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
      // Tangent through the node (prev → next): the loop follows the path here.
      const prev = pts[i - 1] ?? pts[i];
      const next = pts[i + 1] ?? pts[i];
      const ul = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
      const ux = (next[0] - prev[0]) / ul;
      const uy = (next[1] - prev[1]) / ul;
      const r = 0.7 + rnd() * 0.85; // size varies
      const aspect = 0.7 + rnd() * 0.55; // round ↔ teardrop
      const side = rnd() < 0.5 ? 1 : -1; // which side it curls
      const dir = rnd() < 0.5 ? 1 : -1; // winding
      d += ` ${loopPath(pts[i][0], pts[i][1], ux, uy, r, aspect, side, dir)}`;
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
