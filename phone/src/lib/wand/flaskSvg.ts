// flaskSvg.ts — pure SVG string generator for a note's flask glyph.
//
// Ported verbatim from 01-the-wand-v2.html ~lines 590-617. Pure string-building,
// no DOM: builds an inline <svg> markup string for a given flask shape, hue, and
// fill level. The caller (a component) drops the string in via dangerouslySetInnerHTML
// or an <img>-less inline mount — that wiring is outside this module.

/** The six flask silhouettes the prototype ships. Source ~591. */
export const SHAPES = ["round", "erlenmeyer", "vial", "potion", "teardrop", "beaker"] as const;
export type FlaskShape = (typeof SHAPES)[number];

/** Category → HSL hue triple (as a CSS `h s% l%` string, no `hsl()` wrapper).
 *  Source ~592-593. */
export const CAT_HUE: Record<string, string> = {
  "--cat-blue": "212 70% 68%",
  "--cat-purple": "270 55% 74%",
  "--cat-green": "145 50% 62%",
  "--cat-pink": "330 60% 74%",
  "--cat-orange": "24 85% 68%",
  "--cat-yellow": "45 80% 66%",
  "--cat-red": "0 70% 70%",
  "--cat-gold": "43 92% 55%",
};

interface ShapeSpec {
  body: string;
  top: number;
  bottom: number;
  clip: string;
}

const SHAPE_SPECS: Record<string, ShapeSpec> = {
  round: {
    body: "M24 10v10a14 14 0 1 1-0.001 0Z M18 10h12",
    top: 20,
    bottom: 58,
    clip: "M24 20a14 14 0 1 0 0.001 0Z",
  },
  erlenmeyer: {
    body: "M20 8h8v14l9 30a3 3 0 0 1-3 4H14a3 3 0 0 1-3-4l9-30z M19 8h10",
    top: 22,
    bottom: 54,
    clip: "M20 22 12 52a3 3 0 0 0 3 4h18a3 3 0 0 0 3-4L28 22z",
  },
  vial: {
    body: "M18 8h12v40a6 6 0 0 1-12 0z M17 8h14",
    top: 18,
    bottom: 52,
    clip: "M18 18h12v30a6 6 0 0 1-12 0z",
  },
  potion: {
    body: "M21 8h6v6c5 2 9 7 9 14a15 15 0 0 1-30 0c0-7 4-12 9-14z M20 8h8",
    top: 22,
    bottom: 58,
    clip: "M24 22a13 13 0 1 0 0.001 0Z",
  },
  teardrop: {
    body: "M24 8c6 10 11 17 11 26a11 11 0 0 1-22 0c0-9 5-16 11-26z",
    top: 24,
    bottom: 56,
    clip: "M24 24c4 6 9 11 9 18a9 9 0 0 1-18 0c0-7 5-12 9-18z",
  },
  beaker: {
    body: "M15 10h18l-2 4v34a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V14z M14 10h20 M31 20h4",
    top: 18,
    bottom: 52,
    clip: "M17 18h14v30a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4z",
  },
};

/** Build the flask's inline SVG markup. `shape` is one of SHAPES (falls back to
 *  "round"), `hue` is a CAT_HUE-style `h s% l%` string, `fill` is 0..1 (clamped to
 *  a visible minimum). Source ~594-617. */
export function flaskSVG(shape: string, hue: string, fill: number): string {
  const id = "g" + Math.random().toString(36).slice(2, 8);
  const liquid = `hsl(${hue})`;
  const deep = `hsl(${hue.split(" ")[0]} ${hue.split(" ")[1]} 46%)`;
  const s = SHAPE_SPECS[shape] || SHAPE_SPECS.round;
  const fh = s.bottom - s.top;
  const top = s.bottom - Math.max(6, fh * Math.max(0.12, Math.min(1, fill)));
  return `<svg viewBox="0 0 48 68" width="100%" height="100%" aria-hidden="true"><defs>
      <radialGradient id="${id}g" cx="50%" cy="60%" r="60%"><stop offset="0%" stop-color="${liquid}" stop-opacity=".55"/><stop offset="100%" stop-color="${liquid}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${liquid}" stop-opacity=".9"/><stop offset="100%" stop-color="${deep}" stop-opacity=".95"/></linearGradient>
      <clipPath id="${id}c"><path d="${s.clip}"/></clipPath></defs>
      <ellipse cx="24" cy="46" rx="22" ry="22" fill="url(#${id}g)"/>
      <g clip-path="url(#${id}c)"><rect x="0" y="${top}" width="48" height="${s.bottom - top + 2}" fill="url(#${id}l)"/>
        <rect x="0" y="${top}" width="48" height="2" fill="#fff" opacity=".25"/>
        <path d="M24 ${s.bottom} C 20 ${s.bottom - 10}, 28 ${s.bottom - 16}, 23 ${s.bottom - 26} S 25 ${top + 2}, 24 ${top}" stroke="#fff" stroke-width="1" fill="none" opacity=".5" stroke-linecap="round"/></g>
      <path d="${s.body}" fill="hsl(216 20% 92% / .05)" stroke="hsl(216 30% 88% / .55)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
      <rect x="19" y="${s.top + 2}" width="2.4" height="${Math.max(8, fh * 0.5)}" rx="1.2" fill="#fff" opacity=".35" clip-path="url(#${id}c)"/></svg>`;
}
