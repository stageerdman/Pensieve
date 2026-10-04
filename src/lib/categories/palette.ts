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
