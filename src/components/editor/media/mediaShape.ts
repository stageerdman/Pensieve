// Pure geometry for the image box's size + shape (the ⋯ menu and the corner handle).
//
// A media block carries two independent numbers:
//   • width  — a fraction of the text column (0..1). Size presets and the right-edge
//              handle set this.
//   • aspect — width / height. 0 (or unset) = "natural": the box follows the image's own
//              aspect (or a default when empty). A non-zero aspect is an explicit reshape
//              (the corner handle, or a future preset), and it holds even for an EMPTY
//              placeholder — so you can shape the box before an image is in it.
// "Restore to original" clears aspect and resets width to the default, so the box returns
// to the uploaded image's natural dimensions (or the default empty box when still empty).

export const DEFAULT_WIDTH = 0.75;
export const WIDTH_SNAPS = [0.25, 0.5, 0.75, 1] as const;
/** The empty-placeholder's natural aspect when no image + no explicit shape (a calm 3:2). */
export const PLACEHOLDER_ASPECT = 3 / 2;

export type SizePreset = "small" | "medium" | "large" | "full";
const PRESET_WIDTH: Record<SizePreset, number> = { small: 0.25, medium: 0.5, large: 0.75, full: 1 };

export interface Shape {
  width: number; // 0..1 of the column
  aspect: number; // width/height; 0 = natural
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Nearest width snap (used by the right-edge width-only handle). */
export function snapWidth(fraction: number): number {
  return WIDTH_SNAPS.reduce(
    (best, s) => (Math.abs(s - fraction) < Math.abs(best - fraction) ? s : best),
    WIDTH_SNAPS[0],
  );
}

/** Step the width one snap left/right (⌘[ / ⌘]). */
export function stepWidth(current: number, dir: -1 | 1): number {
  const snapped = snapWidth(current);
  const i = WIDTH_SNAPS.indexOf(snapped as (typeof WIDTH_SNAPS)[number]);
  return WIDTH_SNAPS[clamp(i + dir, 0, WIDTH_SNAPS.length - 1)];
}

/** A size preset → the width fraction (leaves aspect untouched). */
export function presetWidth(preset: SizePreset): number {
  return PRESET_WIDTH[preset];
}

/** Which preset (if any) a width currently matches — for the ⋯ menu's checkmark. */
export function widthPreset(width: number): SizePreset | null {
  const entry = (Object.entries(PRESET_WIDTH) as [SizePreset, number][]).find(
    ([, w]) => Math.abs(w - width) < 1e-6,
  );
  return entry ? entry[0] : null;
}

/** The corner (bottom-right) drag → a new {width, aspect}. `dx`/`dy` are the pointer delta
 *  in px from the drag start; `startW`/`startH` the frame's start size in px; `colWidth` the
 *  text-column width in px. Width is clamped to [0.15, 1] of the column; aspect to a sane band
 *  so the box can't collapse to a sliver. Unsnapped — the corner is for free shaping. */
export function cornerResize(
  startW: number,
  startH: number,
  dx: number,
  dy: number,
  colWidth: number,
): Shape {
  const w = clamp((startW + dx) / (colWidth || 1), 0.15, 1);
  const h = Math.max(24, startH + dy);
  const px = Math.max(24, startW + dx);
  const aspect = clamp(px / h, 0.3, 4);
  return { width: w, aspect };
}

/** "Restore to original": default width, natural aspect (0). */
export function restoreShape(): Shape {
  return { width: DEFAULT_WIDTH, aspect: 0 };
}

export function isDefaultWidth(w: number | undefined): boolean {
  return w === undefined || Math.abs(w - DEFAULT_WIDTH) < 1e-6;
}
export function isNaturalAspect(a: number | undefined): boolean {
  return !a || a <= 0;
}
/** A box at its default size AND natural shape → serializes as plain `![]()` (no fence). */
export function isDefaultShape(width: number | undefined, aspect: number | undefined): boolean {
  return isDefaultWidth(width) && isNaturalAspect(aspect);
}

/** The CSS `aspect-ratio` value for the frame: the explicit shape, else natural (empty
 *  placeholder gets PLACEHOLDER_ASPECT; a loaded image gets undefined = let the <img> size it). */
export function frameAspect(aspect: number | undefined, hasImage: boolean): number | undefined {
  if (!isNaturalAspect(aspect)) return aspect;
  return hasImage ? undefined : PLACEHOLDER_ASPECT;
}
