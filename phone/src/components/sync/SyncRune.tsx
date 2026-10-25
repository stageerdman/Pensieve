// SyncRune.tsx — the lemniscate sync glyph, ported from the desktop's SyncRune
// (src/components/icons.tsx): the exact same figure-8 path, drawn unfinished at
// rest (pathLength=1, a dash fraction hides one strand so it reads as an "S").
//
// Colour + flow are CSS, keyed by `data-state` on the .sync-rune wrapper (see
// .sync-rune rules in wand.css) — the same currentColor-through-.lemniscate
// pattern SpellWindow's .sw-rune already used, just generalised into one shared
// component so the header, the Spell Menu glyph, and the window rune all draw
// (and animate) identically.

import type { SyncStatus } from "../../lib/wand/syncMachine";

export function SyncRune({
  status,
  size = 18,
  className,
}: {
  status: SyncStatus;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`sync-rune${className ? ` ${className}` : ""}`} data-state={status} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          className="lemniscate"
          pathLength={1}
          d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z"
        />
      </svg>
    </span>
  );
}
