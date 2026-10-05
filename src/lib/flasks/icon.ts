// A note's icon is a magical "memory flask": a SHAPE paired with a COLOUR. The
// colour reuses the category palette keys (see lib/categories/palette) so a flask
// is theme-correct in light and dark with no parallel hex table. This module owns
// only the MODEL (types + frontmatter encode/decode); the SVG rendering lives in
// the Flask component (components/Flask).

import { CATEGORY_COLORS, type CategoryColor } from "../categories/palette";

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

export interface NoteIcon {
  shape: FlaskShape;
  color: CategoryColor;
}

/** Rendered for any note that hasn't chosen an icon yet — a calm magical-blue
 *  round flask. Never persisted (plain notes stay plain in frontmatter); it is a
 *  render-time fallback only. */
export const DEFAULT_ICON: NoteIcon = { shape: "round-bottom", color: "blue" };

const SHAPES = new Set<string>(FLASK_SHAPES);
const COLORS = new Set<string>(CATEGORY_COLORS);

export function isFlaskShape(v: string): v is FlaskShape {
  return SHAPES.has(v);
}

/** Frontmatter form: `shape/color` (e.g. `round/blue`). Compact, human-legible. */
export function encodeIcon(icon: NoteIcon): string {
  return `${icon.shape}/${icon.color}`;
}

/** Parse a frontmatter `icon` value. Unknown shape/colour → undefined (treated as
 *  "no icon", so the default renders) — never throws on hand-edited files. */
export function parseIcon(raw: string): NoteIcon | undefined {
  const [shape, color] = raw.trim().split("/").map((s) => s.trim());
  if (!shape || !color || !SHAPES.has(shape) || !COLORS.has(color)) return undefined;
  return { shape: shape as FlaskShape, color: color as CategoryColor };
}
