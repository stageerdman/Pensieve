// ringLayout.ts — pure geometry for the radial Spell Menu.
//
// Glyphs orbit a center. Angle α is clockwise from 12 o'clock; screen offsets are
//   x = R·sin α        (→ right)
//   y = −R·cos α        (↓ down; α=0 is straight up, above the center)
// Index 0 is the most-used spell and rests at the TOP (α = 0).
//
// Two regimes:
//   · static  (N ≤ CAPACITY): a fixed ring. 4–8 → full circle; 2–3 → lower-180° arc
//     (thumb zone); 1 → a single glyph at the top.
//   · scroll  (N ≥ CAPACITY+1): a Ferris wheel. Fixed pitch; the position p rotates it;
//     glyphs fade + shrink as they near the bottom VOID wedge and "fall into nothingness".
//
// Sprites stay upright — only POSITIONS orbit (this is what keeps a rotary menu legible).

export const RING = {
  R: 128, // ring radius, center-to-glyph-center (px)
  centerXFrac: 0.5,
  centerYFrac: 0.56, // biased 6% below geometric center for thumb reach
  glyph: 64, // visible disc (px) — larger, so spells feel substantial
  cell: 84, // hit target (px)
  pitchDeg: 40, // scroll-mode angular spacing between adjacent glyphs
  capacity: 8, // ≤ this → static ring; above → scroll
  voidEdge: 150, // |angle| ≥ this → fully gone (the bottom void, symmetric L/R)
  fadeRamp: 30, // degrees over which opacity ramps to the void edge
  dragPxPerSlot: 64, // 64px of drag = one slot (pitchDeg) of rotation
} as const;

export interface GlyphPos {
  index: number;
  angleDeg: number; // 0 = top, clockwise
  x: number; // screen offset from center, px (right +)
  y: number; // screen offset from center, px (down +)
  opacity: number; // 0..1
  scale: number; // 0.6..1
  visible: boolean; // opacity > 0.02
  focus: boolean; // the glyph currently resting nearest the top
}

const TAU = Math.PI * 2;

function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Shortest absolute angular distance (0..180) between two headings. */
export function angularGap(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function offset(angleDeg: number): { x: number; y: number } {
  const r = (angleDeg / 360) * TAU;
  return { x: RING.R * Math.sin(r), y: -RING.R * Math.cos(r) };
}

/**
 * Void-fade opacity for a SIGNED angle off the top (0 = top; ± toward the bottom void).
 * 1 across the lit top arc; ramps down over `fadeRamp` degrees; 0 once |angle| ≥ voidEdge,
 * symmetric on the left and right so glyphs dissolve into nothingness on both descents.
 */
export function voidOpacity(angleDeg: number): number {
  const a = Math.abs(angleDeg);
  if (a >= RING.voidEdge) return 0;
  if (a <= RING.voidEdge - RING.fadeRamp) return 1;
  return (RING.voidEdge - a) / RING.fadeRamp;
}

/** Is this count going to scroll (vs a fixed static ring)? */
export function isScroll(n: number): boolean {
  return n > RING.capacity;
}

/** Max scroll position for `n` glyphs: p=0 → glyph0 at top; p=n-1 → last glyph at top. */
export function maxScroll(n: number): number {
  return Math.max(0, n - 1);
}

/** The static angles for small counts (lower-arc for 2–3, full circle for 4–8, top for 1). */
function staticAngles(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [120, 240];
  if (n === 3) return [110, 180, 250];
  // 4..CAPACITY — evenly spaced full circle from 12 o'clock, clockwise
  return Array.from({ length: n }, (_, i) => (i * 360) / n);
}

/**
 * Lay out `n` glyphs. For scroll rings, `scrollPos` (continuous, clamped to [0, n-1])
 * rotates the wheel. Returns one GlyphPos per index, in index order.
 */
export function layoutRing(n: number, scrollPos = 0): GlyphPos[] {
  if (n <= 0) return [];

  if (!isScroll(n)) {
    const angles = staticAngles(n);
    // nearest-to-top glyph is the focus (for small rings this is cosmetic)
    let focusIdx = 0;
    let best = Infinity;
    angles.forEach((a, i) => {
      const g = angularGap(a, 0);
      if (g < best) {
        best = g;
        focusIdx = i;
      }
    });
    return angles.map((angleDeg, index) => {
      const { x, y } = offset(angleDeg);
      return { index, angleDeg, x, y, opacity: 1, scale: 1, visible: true, focus: index === focusIdx };
    });
  }

  // scroll ring — a signed arc fanning up BOTH sides from the focus (index p at the top).
  // Glyphs more than voidEdge° off the top are hidden; nothing wraps around the bottom.
  const p = Math.max(0, Math.min(maxScroll(n), scrollPos));
  const focusIdx = Math.max(0, Math.min(n - 1, Math.round(p)));
  return Array.from({ length: n }, (_, index) => {
    const angleDeg = (index - p) * RING.pitchDeg; // signed, no wrap
    const opacity = voidOpacity(angleDeg);
    const scale = 0.6 + 0.4 * opacity;
    const { x, y } = offset(angleDeg);
    return {
      index,
      angleDeg,
      x: x * scale,
      y: y * scale,
      opacity,
      scale,
      visible: opacity > 0.02,
      focus: index === focusIdx,
    };
  });
}

/** Convert a drag delta (px, up = negative) into a scroll-position delta (slots). */
export function dragToScroll(dragPx: number): number {
  return dragPx / RING.dragPxPerSlot;
}

/** Clamp + snap a released scroll position to the nearest resting slot. */
export function snapScroll(n: number, p: number): number {
  return Math.max(0, Math.min(maxScroll(n), Math.round(p)));
}
