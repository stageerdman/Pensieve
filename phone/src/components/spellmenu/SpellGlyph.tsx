// SpellGlyph.tsx — the one icon set for spells + the "Orbit" menu-button hero.
//
// Stroke glyphs share a 24-grid, one stroke weight (--glyph-stroke), round caps/joins,
// and `currentColor` so the parent button owns the hue (gold / violet / accent). The menu
// "Orbit" glyph is a 28-grid of filled pips (a ring of spells around a hub) that literally
// mirrors the radial menu it opens; its Conditional variant swaps the hub for a 4-point spark.

import type { IconName } from "../../lib/spells/types";
import type { SyncStatus } from "../../lib/wand/syncMachine";
import { SyncRune } from "../sync/SyncRune";

/** Line-glyph path markup, keyed by icon. 24-grid; inherits stroke from the <svg>.
 *  "sync" is handled separately (SyncRune, below) — it's the one state-coloured,
 *  animated glyph, not a static stroke path like everything else here. */
const PATHS: Record<Exclude<IconName, "menu" | "sync">, React.ReactNode> = {
  // a camera body (with viewfinder bump) + lens ring — "take a new photo", distinct from the
  // "image" glyph's framed-photo-with-horizon (that one means "an existing photo").
  camera: (
    <>
      <path d="M9 6.2 9.9 4.6a1.4 1.4 0 0 1 1.2-.7h1.8a1.4 1.4 0 0 1 1.2.7l.9 1.6H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="12.4" r="3.4" />
    </>
  ),
  // a capsule mic + stand — "record your voice", a plain single-stroke glyph.
  mic: (
    <>
      <path d="M9 5.5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Z" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3M9 20h6" />
    </>
  ),
  // a bin + lid + lid-handle — "delete this memory", the one destructive glyph (always rides
  // the "danger" hue, never the form's own colour).
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5.6c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7" />
      <path d="M7 7l.9 12.2a1.8 1.8 0 0 0 1.8 1.6h4.6a1.8 1.8 0 0 0 1.8-1.6L17 7" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  write: (
    <>
      <path d="M4 20l1.3-4L15 6.3a1.8 1.8 0 0 1 2.5 2.5L8.3 18.5 4 20Z" />
      <path d="M13.5 7.8l2.7 2.7" />
      <path d="M19 3.4v3M17.5 4.9h3" />
    </>
  ),
  accio: (
    // nudged so the lens+handle centroid lands at the grid center (was up-left)
    <g transform="translate(1,1)">
      <circle cx="10.5" cy="10.5" r="5.3" />
      <path d="M14.6 14.6 19.5 19.5" />
      <path d="M8.4 8.4v2.2M7.3 9.5h2.2" />
    </g>
  ),
  // a single-stroke photo frame: a bordered rect, a sun, and a rising-horizon line
  image: (
    <>
      <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.4" />
      <circle cx="8.4" cy="9.8" r="1.5" />
      <path d="M4 16.5l4.6-4.3a1.6 1.6 0 0 1 2.2 0L16 17M14 14.2l1.8-1.7a1.6 1.6 0 0 1 2.2 0l2 1.9" />
    </>
  ),
  // a 2×2 grid of rounded tiles — "a collection of photos", distinct from the single image frame
  gallery: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  // "edit the board": a pencil writing on a card — the card distinguishes it from the plain
  // "write" pencil (this edits an existing collection, not a blank page).
  edit: (
    <>
      <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
      <path d="M18.3 3.7a2 2 0 0 1 2.8 2.8L12 17.6l-4 1 1-4Z" />
    </>
  ),
  // a "return rune": a left arrowhead feeding a line that hooks and curls back on itself —
  // reads as "go back" in a magical register, distinct from the gold Orbit beside it.
  back: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
};

/** Six fire-gold ember-orbs on a ring (12 o'clock clockwise), 32-grid, radius 11 — no hub. */
const ORBIT_PIPS = (
  <>
    <circle className="sm-orb" cx="16" cy="5" r="3.1" fill="url(#sm-ember)" />
    <circle className="sm-orb" cx="25.53" cy="10.5" r="3.1" fill="url(#sm-ember)" />
    <circle className="sm-orb" cx="25.53" cy="21.5" r="3.1" fill="url(#sm-ember)" />
    <circle className="sm-orb" cx="16" cy="27" r="3.1" fill="url(#sm-ember)" />
    <circle className="sm-orb" cx="6.47" cy="21.5" r="3.1" fill="url(#sm-ember)" />
    <circle className="sm-orb" cx="6.47" cy="10.5" r="3.1" fill="url(#sm-ember)" />
  </>
);

export interface SpellGlyphProps {
  icon: IconName;
  size?: number;
  className?: string;
  /** menu glyph only: swap the hub for a 4-point spark (Conditional mode). */
  conditional?: boolean;
  /** sync glyph only: drives the rune's colour + flow (see .sync-rune in wand.css). */
  syncState?: SyncStatus;
}

export function SpellGlyph({ icon, size = 22, className, conditional = false, syncState = "synced" }: SpellGlyphProps) {
  if (icon === "sync") {
    return <SyncRune status={syncState} size={size} className={className} />;
  }

  if (icon === "menu") {
    // 32-grid: six fire-gold ember-orbs on a ring, NO hub — the glyph IS a spell-ring in
    // miniature. Transparent button; each orb is a hot white-gold core bleeding to gold.
    // The glow + flicker live in CSS (.spell-fab). overflow:visible lets the glow bleed.
    void conditional;
    return (
      <svg className={className} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id="sm-ember" cx="40%" cy="34%" r="66%">
            <stop offset="0%" stopColor="hsl(45 100% 95%)" />
            <stop offset="34%" stopColor="hsl(var(--gold-glow))" />
            <stop offset="72%" stopColor="hsl(var(--gold-mid))" />
            <stop offset="100%" stopColor="hsl(var(--gold-deep))" />
          </radialGradient>
        </defs>
        {ORBIT_PIPS}
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ strokeWidth: "var(--glyph-stroke)" }}
      aria-hidden="true"
    >
      {PATHS[icon]}
    </svg>
  );
}
