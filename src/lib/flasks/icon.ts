// A note's icon is a magical "memory flask": a SHAPE paired with a COLOUR. The
// colour reuses the category palette keys (see lib/categories/palette) so a flask
// is theme-correct in light and dark with no parallel hex table. This module owns
// only the MODEL (types + frontmatter encode/decode); the SVG rendering lives in
// the Flask component (components/Flask).

import { CATEGORY_COLORS, type CategoryColor, type FlaskColor } from "../categories/palette";

/** The flask silhouettes the picker offers. Each is distinct by shape alone, so a
 *  note is recognisable even when two notes share a colour. */
export type FlaskShape =
  | "round-bottom" // Florence flask — long neck, spherical bulb (the app's logo mark)
  | "erlenmeyer" // conical lab flask — triangular silhouette
  | "vial" // slim test-tube — tall, parallel sides
  | "potion-bottle" // shouldered apothecary bottle — stout, round shoulders
  | "teardrop" // orb / pendant vial — pointed top, round bottom, no neck
  | "beaker"; // wide, straight-sided, open-top with a pour lip

export const FLASK_SHAPES: FlaskShape[] = [
  "round-bottom",
  "erlenmeyer",
  "vial",
  "potion-bottle",
  "teardrop",
  "beaker",
];

/** Human-readable names for aria labels / tooltips. */
export const SHAPE_LABELS: Record<FlaskShape, string> = {
  "round-bottom": "Round-bottom flask",
  erlenmeyer: "Conical flask",
  vial: "Vial",
  "potion-bottle": "Potion bottle",
  teardrop: "Teardrop vial",
  beaker: "Beaker",
};

export interface NoteIcon {
  shape: FlaskShape;
  /** A palette key or a free hue (0..359) picked from the spectrum. */
  color: FlaskColor;
  /** How rich/saturated the liquid reads, 0..1 (soft → vivid). Default when unset. */
  vibrancy?: number;
  /** How glossy the glass reads, 0..1 (matte → glossy). Default when unset. */
  shine?: number;
}

// vibrancy/shine both default to the midpoint, which reproduces today's flask look
// exactly (the Flask formulas are anchored at 0.5).
export const DEFAULT_VIBRANCY = 0.5;
export const DEFAULT_SHINE = 0.5;

export const iconVibrancy = (icon?: NoteIcon): number => icon?.vibrancy ?? DEFAULT_VIBRANCY;
export const iconShine = (icon?: NoteIcon): number => icon?.shine ?? DEFAULT_SHINE;

// Fill level is driven by CONTENT, not chosen: a title-only note is an empty flask;
// ~5000 non-space content chars reads as the normal fill; by ~10000 it is brim-full
// ("overfilled"). `fillForChars` returns the fill fraction 0..1 the Flask renders —
// concave below normal so even short notes read as holding "some".
export const NORMAL_CHARS = 5000;
export const OVERFILL_CHARS = 10000;
export const NORMAL_FILL = 0.8; // fraction that reproduces today's "normal" look

export function fillForChars(chars: number): number {
  if (chars <= 0) return 0;
  if (chars <= NORMAL_CHARS) return NORMAL_FILL * Math.pow(chars / NORMAL_CHARS, 0.7);
  return NORMAL_FILL + (1 - NORMAL_FILL) * Math.min((chars - NORMAL_CHARS) / NORMAL_CHARS, 1);
}

/** Rendered for any note that hasn't chosen an icon yet — a calm neutral gray vial.
 *  Never persisted (plain notes stay plain in frontmatter); it is a render-time
 *  fallback only, so an un-iconned note reads as "unset" until the owner chooses. */
export const DEFAULT_ICON: NoteIcon = { shape: "vial", color: "gray" };

const SHAPES = new Set<string>(FLASK_SHAPES);
const COLORS = new Set<string>(CATEGORY_COLORS);

export function isFlaskShape(v: string): v is FlaskShape {
  return SHAPES.has(v);
}

const pct = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100);
const isDefault = (icon: NoteIcon) =>
  iconVibrancy(icon) === DEFAULT_VIBRANCY && iconShine(icon) === DEFAULT_SHINE;

/** A colour is a palette key (`blue`) or a free hue written `h<0..359>` (`h212`). */
const encodeColor = (c: FlaskColor): string =>
  typeof c === "number" ? `h${((Math.round(c) % 360) + 360) % 360}` : c;

function parseColor(raw: string): FlaskColor | undefined {
  const m = /^h(\d{1,3})$/.exec(raw);
  if (m) {
    const h = Number(m[1]);
    return h >= 0 && h <= 359 ? h : undefined;
  }
  return COLORS.has(raw) ? (raw as CategoryColor) : undefined;
}

/** Frontmatter form: `shape/color` (e.g. `vial/gray` or `vial/h212`), or
 *  `shape/color/vibrancy/shine` when vibrancy/shine differ from the defaults
 *  (percentages, e.g. `vial/blue/80/30`). Compact and human-legible. */
export function encodeIcon(icon: NoteIcon): string {
  const base = `${icon.shape}/${encodeColor(icon.color)}`;
  return isDefault(icon) ? base : `${base}/${pct(iconVibrancy(icon))}/${pct(iconShine(icon))}`;
}

/** Parse a frontmatter `icon` value. Unknown shape/colour → undefined (treated as
 *  "no icon", so the default renders) — never throws on hand-edited files. Vibrancy
 *  and shine (optional 3rd/4th fields, 0..100) fall back to defaults when absent or
 *  unparseable. */
export function parseIcon(raw: string): NoteIcon | undefined {
  const parts = raw.trim().split("/").map((s) => s.trim());
  const [shape, colorRaw, v, s] = parts;
  const color = colorRaw ? parseColor(colorRaw) : undefined;
  if (!shape || !SHAPES.has(shape) || color === undefined) return undefined;
  const icon: NoteIcon = { shape: shape as FlaskShape, color };
  const vn = Number(v);
  const sn = Number(s);
  if (v !== undefined && Number.isFinite(vn)) icon.vibrancy = Math.min(1, Math.max(0, vn / 100));
  if (s !== undefined && Number.isFinite(sn)) icon.shine = Math.min(1, Math.max(0, sn / 100));
  return icon;
}
