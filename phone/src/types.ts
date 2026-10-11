// types.ts — the Note shape used across the Wand UI.
//
// Mirrors the prototype's seed-record shape (01-the-wand-v2.html ~619-638). `.d` is
// the LIVE recency label (becomes "Just now" when edited); `.created` is the stable
// CREATED date that never changes and drives the today/yesterday/week filters.

import type { FlaskShape } from "./lib/wand/flaskSvg";

export interface Note {
  /** Stable unique id. */
  id: number;
  /** Title (first line / auto-H1). */
  t: string;
  /** Body text (newline-joined). */
  c: string;
  /** Category key — a `--cat-*` token name (also keys flaskSvg's CAT_HUE). */
  cat: string;
  /** Flask silhouette. */
  shape: FlaskShape;
  /** Liquid fill level, 0..1. */
  fill: number;
  /** Live/recency display label ("2m ago", "Today", "Just now"). */
  d: string;
  /** Stable created-date label — never overwritten by edits. */
  created: string;
  /** Full timestamp shown in the note header for a freshly created note. */
  when?: string;
  /** A brand-new, never-typed note (empty title line, caret-ready). */
  fresh?: boolean;
  /** Not yet committed into DATA (so the first real edit unshifts it in). */
  isNew?: boolean;
}
