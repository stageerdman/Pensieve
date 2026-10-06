// The fixed Notion-style category palette. A category's colour is one of these
// KEYS (never a raw hex), so it resolves through CSS variables (index.css) and works
// in light and dark automatically. Each key has a soft tinted `bg` (chips) and a
// saturated `fg` (chip text + the solid dot).

export type CategoryColor =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export const CATEGORY_COLORS: CategoryColor[] = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

export const catBg = (c: CategoryColor) => `hsl(var(--cat-${c}-bg))`;
export const catFg = (c: CategoryColor) => `hsl(var(--cat-${c}-fg))`;

// A flask's colour is either a palette KEY (above) or a free HUE (0..359) picked from
// the spectrum. A hue rides the theme-paired `--flask-s`/`--flask-l` tokens so it stays
// theme-correct with no parallel hex table — the same philosophy as the keys.
export type FlaskColor = CategoryColor | number;

const norm = (h: number) => ((Math.round(h) % 360) + 360) % 360;

/** Representative hue for each palette key (for seeding the spectrum thumb from a
 *  legacy key-coloured flask). Gray is neutral; we park it at a cool default. */
const KEY_HUE: Record<CategoryColor, number> = {
  gray: 220,
  brown: 25,
  orange: 24,
  yellow: 44,
  green: 145,
  blue: 212,
  purple: 270,
  pink: 330,
  red: 0,
};

export const hueOfColor = (c: FlaskColor): number =>
  typeof c === "number" ? norm(c) : KEY_HUE[c];

/** The `H S% L%` channel triple for a flask colour, for use inside `hsl(<triple> / a)`.
 *  Keys resolve through their `--cat-*` token (so gray stays truly neutral); a hue
 *  rides the `--flask-*` tokens. */
export const colorChannels = (c: FlaskColor): string =>
  typeof c === "number" ? `${norm(c)} var(--flask-s) var(--flask-l)` : `var(--cat-${c}-fg)`;

export const colorFg = (c: FlaskColor, a = 1) => `hsl(${colorChannels(c)} / ${a})`;

/** Human/aria label for a flask colour. */
export const colorLabel = (c: FlaskColor): string =>
  typeof c === "number" ? `hue ${norm(c)}°` : c;
