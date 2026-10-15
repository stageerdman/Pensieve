// Pure layout math for the desktop Pinterest-style gallery: a HORIZONTAL, justified, height-driven
// strip. The user drags the container HEIGHT; that height picks a row count R; every image is scaled
// to one shared row height (so each keeps its own aspect ratio, only its width varies); the images
// are partitioned — IN ORDER — into the R rows so each row's total width is as even as possible; the
// strip then overflows and scrolls sideways. DOM-free so the math is unit-testable.
//
// This is the transpose of Flickr's justified-ROW layout (which fixes width and solves row height):
// here we fix height and solve the row count + per-image width. See the update wiki for the research.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface JustifyOpts {
  containerHeight: number; // px, the user-dragged gallery height
  gap: number; // px between tiles and between rows
  targetRowH: number; // px, the comfortable per-row height the row count aims for
  maxRows: number; // never stack more rows than this
}

export interface JustifyTile {
  index: number; // position in the original images array (order preserved)
  width: number; // px
  height: number; // px (= the shared row height)
}
export interface JustifyRow {
  tiles: JustifyTile[];
  width: number; // px, sum of tile widths + inter-tile gaps
}
export interface JustifyResult {
  rows: JustifyRow[];
  rowH: number; // the shared row height
  rowCount: number;
  contentWidth: number; // px, the widest row = the horizontal scroll extent
}

/** How many rows a dragged height implies: round height/targetRow, clamped to [1, maxRows] and to
 *  the image count (never more rows than images). */
export function rowCountForHeight(containerHeight: number, gap: number, targetRowH: number, maxRows: number, imageCount: number): number {
  if (imageCount <= 0) return 1;
  const r = Math.round((containerHeight + gap) / (targetRowH + gap));
  return clamp(r, 1, Math.min(maxRows, imageCount));
}

/** Partition `weights` into exactly `k` CONTIGUOUS groups minimising the largest group sum (the
 *  classic "linear partition" DP). Order-preserving → rows read left-to-right, top-to-bottom.
 *  Returns `k` arrays of original indices (k is clamped to ≤ weights.length; empty in → []). */
export function linearPartition(weights: number[], k: number): number[][] {
  const n = weights.length;
  if (n === 0) return [];
  k = clamp(k, 1, n);
  if (k === 1) return [weights.map((_, i) => i)];
  if (k === n) return weights.map((_, i) => [i]);

  // dp[i][j] = min achievable "largest group sum" splitting the first i items into j groups.
  // divider[i][j] = the start index of the j-th (last) group in that optimal split.
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + weights[i]);
  const sum = (a: number, b: number) => prefix[b] - prefix[a]; // weights[a..b-1]

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  const div: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= Math.min(k, i); j++) {
      // last group = items [p..i); minimise max(dp over first p into j-1, that group's sum).
      for (let p = j - 1; p < i; p++) {
        const cost = Math.max(dp[p][j - 1], sum(p, i));
        if (cost < dp[i][j]) {
          dp[i][j] = cost;
          div[i][j] = p;
        }
      }
    }
  }

  // Reconstruct group boundaries from the divider table.
  const bounds: number[] = [n];
  let i = n;
  let j = k;
  while (j > 1) {
    const p = div[i][j];
    bounds.unshift(p);
    i = p;
    j--;
  }
  bounds.unshift(0);
  const groups: number[][] = [];
  for (let g = 0; g < bounds.length - 1; g++) {
    const row: number[] = [];
    for (let idx = bounds[g]; idx < bounds[g + 1]; idx++) row.push(idx);
    groups.push(row);
  }
  return groups;
}

/** Lay out images (given their aspect ratios = naturalW/naturalH) into a height-driven justified
 *  horizontal strip. An aspect ≤ 0 or non-finite falls back to 1 (square) until it's measured. */
export function justifyGallery(aspects: number[], opts: JustifyOpts): JustifyResult {
  const { gap } = opts;
  const n = aspects.length;
  const rowCount = rowCountForHeight(opts.containerHeight, gap, opts.targetRowH, opts.maxRows, n);
  const rowH = (opts.containerHeight - (rowCount - 1) * gap) / rowCount;
  if (n === 0) return { rows: [], rowH, rowCount, contentWidth: 0 };

  const safeAspect = (a: number) => (Number.isFinite(a) && a > 0 ? a : 1);
  const widths = aspects.map((a) => safeAspect(a) * rowH);
  const groups = linearPartition(widths, rowCount);

  const rows: JustifyRow[] = groups.map((indices) => {
    const tiles: JustifyTile[] = indices.map((index) => ({ index, width: widths[index], height: rowH }));
    const width = tiles.reduce((s, t) => s + t.width, 0) + Math.max(0, tiles.length - 1) * gap;
    return { tiles, width };
  });
  const contentWidth = rows.reduce((m, r) => Math.max(m, r.width), 0);
  return { rows, rowH, rowCount: rows.length, contentWidth };
}
