// ringLayout.ts — pure geometry for the radial Spell Menu (a continuous, spinnable dial).
//
// Glyphs sit on a ring about a center. Angle α is clockwise from 12 o'clock; screen offsets
//   x = R·sin α        (→ right)
//   y = −R·cos α        (↓ down; α=0 is straight up, above the center)
// Index 0 is the most-used spell; at rest (p=0) it sits at the TOP (α=0).
//
// The dial is CONTINUOUS and LOOPS: the scroll position p is unbounded; each glyph takes the
// representative of (i − p) folded into [−n/2, n/2], so it always sits on the nearest arc to
// the top and the ring can be spun forever in either direction (no dead-end that snaps back).
//
// Two looks:
//   · full circle (small n, where n·pitch ≤ 360): evenly spaced, all visible — spinning it is
//     cosmetic but always responds.
//   · arc + void (large n): fixed pitch; glyphs fan up both sides of the top and FADE into a
//     bottom void on each side ("drift into the dark"), with hidden-counts on the left/right.
//
// Sprites stay upright — only POSITIONS move (keeps a rotary menu legible).

export const RING = {
  R: 118, // ring radius, center-to-glyph-center (px)
  centerXFrac: 0.5,
  centerYFrac: 0.6, // lowered into the thumb zone (keep in sync with --ring-cy in CSS)
  glyph: 64, // visible disc (px)
  cell: 84, // hit target (px)
  pitchDeg: 40, // arc-mode angular spacing between adjacent glyphs
  voidEdge: 150, // |angle| ≥ this → fully gone (the bottom void, symmetric L/R)
  fadeRamp: 30, // degrees over which opacity ramps to the void edge
} as const;

export interface GlyphPos {
  index: number;
  angleDeg: number; // signed, 0 = top; + down-right, − down-left
  x: number; // screen offset from center, px (right +)
  y: number; // screen offset from center, px (down +)
  opacity: number; // 0..1
  scale: number; // 0.6..1
  visible: boolean; // opacity > 0.02
  focus: boolean; // the glyph currently resting nearest the top
}

const TAU = Math.PI * 2;

function offset(angleDeg: number): { x: number; y: number } {
  const r = (angleDeg / 360) * TAU;
  return { x: RING.R * Math.sin(r), y: -RING.R * Math.cos(r) };
}

/** Fold k into its nearest representative in [−n/2, n/2] so the ring loops seamlessly. */
function foldOffset(k: number, n: number): number {
  return k - n * Math.round(k / n);
}

/**
 * Void-fade opacity for a SIGNED angle off the top (0 = top; ± toward the bottom void).
 * 1 across the lit top arc; ramps down over `fadeRamp`°; 0 once |angle| ≥ voidEdge — symmetric
 * left/right so glyphs dissolve into nothingness on both descents.
 */
export function voidOpacity(angleDeg: number): number {
  const a = Math.abs(angleDeg);
  if (a >= RING.voidEdge) return 0;
  if (a <= RING.voidEdge - RING.fadeRamp) return 1;
  return (RING.voidEdge - a) / RING.fadeRamp;
}

/** Angular spacing between adjacent glyphs: a full even circle when they fit, else the pitch. */
export function ringSpacing(n: number): number {
  return n > 0 && n * RING.pitchDeg <= 360 ? 360 / n : RING.pitchDeg;
}

/** Arc mode = too many to fit a full circle → glyphs fade into the void and some are hidden. */
export function isScroll(n: number): boolean {
  return n * RING.pitchDeg > 360;
}

/** Full circles LOOP forever; arc rings (some spells hidden) are FINITE — end to end only. */
export function loops(n: number): boolean {
  return !isScroll(n);
}

/** Furthest resting position: last glyph at the top for a finite arc; unbounded if looping. */
export function maxScroll(n: number): number {
  return isScroll(n) ? Math.max(0, n - 1) : Infinity;
}

/** Clamp a continuous position: pass through if looping, else hold within [0, n-1]. */
export function clampScroll(n: number, p: number): number {
  if (loops(n)) return p;
  return Math.max(0, Math.min(maxScroll(n), p));
}

/** Normalize a continuous p to the resting index at the top. */
export function focusIndex(n: number, p: number): number {
  if (n <= 0) return 0;
  if (loops(n)) return ((Math.round(p) % n) + n) % n;
  return Math.max(0, Math.min(n - 1, Math.round(p)));
}

/**
 * Lay out `n` glyphs for a continuous scroll position `p` (unbounded; loops). Returns one
 * GlyphPos per index, in index order.
 */
export function layoutRing(n: number, p = 0): GlyphPos[] {
  if (n <= 0) return [];
  if (n === 1) {
    const { x, y } = offset(0);
    return [{ index: 0, angleDeg: 0, x, y, opacity: 1, scale: 1, visible: true, focus: true }];
  }
  const spacing = ringSpacing(n);
  const arc = isScroll(n);
  const loop = loops(n);
  const pp = clampScroll(n, p); // finite arcs never run past their ends
  const focus = focusIndex(n, pp);
  return Array.from({ length: n }, (_, index) => {
    // looping rings fold to the nearest arc (seamless spin); finite arcs use a signed
    // offset so high-index spells stay off to one side until you scroll to them.
    const angleDeg = (loop ? foldOffset(index - pp, n) : index - pp) * spacing;
    const opacity = arc ? voidOpacity(angleDeg) : 1;
    const scale = arc ? 0.6 + 0.4 * opacity : 1;
    const { x, y } = offset(angleDeg);
    return {
      index,
      angleDeg,
      x: x * scale,
      y: y * scale,
      opacity,
      scale,
      visible: opacity > 0.02,
      focus: index === focus,
    };
  });
}

/** How many glyphs have drifted into the void on each side (for the left/right counts). */
export function hiddenCounts(poss: GlyphPos[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const g of poss) {
    if (g.angleDeg >= RING.voidEdge) right++;
    else if (g.angleDeg <= -RING.voidEdge) left++;
  }
  return { left, right };
}

/** Snap a continuous position to the nearest resting slot (clamped for a finite arc). */
export function snapScroll(n: number, p: number): number {
  return clampScroll(n, Math.round(p));
}
