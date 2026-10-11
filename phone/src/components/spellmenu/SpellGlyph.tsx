// SpellGlyph.tsx — the one icon set for spells + the "Orbit" menu-button hero.
//
// Stroke glyphs share a 24-grid, one stroke weight (--glyph-stroke), round caps/joins,
// and `currentColor` so the parent button owns the hue (gold / violet / accent). The menu
// "Orbit" glyph is a 28-grid of filled pips (a ring of spells around a hub) that literally
// mirrors the radial menu it opens; its Conditional variant swaps the hub for a 4-point spark.

import type { IconName } from "../../lib/spells/types";

/** Line-glyph path markup, keyed by icon. 24-grid; inherits stroke from the <svg>. */
const PATHS: Record<Exclude<IconName, "menu">, React.ReactNode> = {
  write: (
    <>
      <path d="M4 20l1.3-4L15 6.3a1.8 1.8 0 0 1 2.5 2.5L8.3 18.5 4 20Z" />
      <path d="M13.5 7.8l2.7 2.7" />
      <path d="M19 3.4v3M17.5 4.9h3" />
    </>
  ),
  accio: (
    <>
      <circle cx="10.5" cy="10.5" r="5.3" />
      <path d="M14.6 14.6 19.5 19.5" />
      <path d="M8.4 8.4v2.2M7.3 9.5h2.2" />
    </>
  ),
  sync: (
    <path d="M12 12c-1.3-2.1-3-3.2-4.8-3.2a3.3 3.3 0 1 0 0 6.6c1.8 0 3.5-1.1 4.8-3.4c1.3 2.3 3 3.4 4.8 3.4a3.3 3.3 0 1 0 0-6.6C15 8.8 13.3 9.9 12 12Z" />
  ),
  stir: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 3.6v3.4h-3.4" />
      <path d="M12 9.8v4.4M9.8 12h4.4" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3.2h6l-1 2v4l3 3v1.1H7V12.2l3-3v-4l-1-2Z" />
      <path d="M12 13.3V20.5" />
    </>
  ),
  label: (
    <>
      <path d="M3 12.3 11.7 3.6a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v5.9a2 2 0 0 1-.6 1.4L11.7 21a2 2 0 0 1-2.8 0l-5.9-5.9a2 2 0 0 1 0-2.8Z" />
      <circle cx="16.4" cy="7.6" r="1.5" />
    </>
  ),
  link: (
    <>
      <path d="M10.6 13.4l2.8-2.8" />
      <path d="M10.8 13.2 8.6 15.4a3 3 0 0 1-4.2-4.2l2.6-2.6a3 3 0 0 1 4.2 0" />
      <path d="M13.2 10.8 15.4 8.6a3 3 0 0 1 4.2 4.2l-2.6 2.6a3 3 0 0 1-4.2 0" />
    </>
  ),
  highlight: (
    <>
      <path d="M5 7h14M5 11h9" />
      <rect x="4" y="14.3" width="12" height="3.6" rx="1.8" fill="currentColor" stroke="none" />
      <path d="M18.8 15v2.6M17.5 16.3h2.6" />
    </>
  ),
  export: (
    <>
      <path d="M12 15.2V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12.8v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  thread: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 6h6a2 2 0 0 1 2 2v2M8 18h6a2 2 0 0 0 2-2v-2" />
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
}

export function SpellGlyph({ icon, size = 22, className, conditional = false }: SpellGlyphProps) {
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
