// types.ts — the Note shape used across the Wand UI.
//
// Mirrors the prototype's seed-record shape (01-the-wand-v2.html ~619-638). `.d` is
// the LIVE recency label (becomes "Just now" when edited); `.created` is the stable
// CREATED date that never changes and drives the today/yesterday/week filters.
//
// `id` is a STRING (not the prototype's incrementing number) so a note minted on the
// phone has a globally-unique id compatible with the desktop vault's `.md` basename
// scheme — required for PWA-CAPTURE real sync (see lib/sync/). `createdAt`/`updatedAt`
// are real epoch ms, added for the same reason (sync conflict detection needs a real
// clock, not just the `d`/`created` display labels, which stay exactly as before).

import type { FlaskShape } from "./lib/wand/flaskSvg";

/** Metadata the desktop app owns that the Wand UI doesn't expose an editor for
 *  (categories/tags/links/pinned, and the icon's exact color/vibrancy/shine). A note
 *  pulled from OneDrive carries this so round-tripping it back (even untouched)
 *  never drops what desktop set — see lib/sync/noteFormat.ts. Absent on a
 *  phone-authored note until it's ever touched by desktop. */
export interface ForeignMeta {
  categories: string[];
  tags: string[];
  links: string[];
  pinned: boolean;
  /** The exact icon as desktop encodes it — a palette key or a raw 0..359 hue,
   *  preserved verbatim so `cat`/`shape` (the phone's nearest-match render of it)
   *  never drifts the source on a round-trip. */
  iconColor: string | number;
  iconVibrancy?: number;
  iconShine?: number;
}

export interface Note {
  /** Stable unique id — the `.md` basename once synced. */
  id: string;
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
  /** Real creation time (epoch ms) — sync bookkeeping only; the UI keeps using `d`/`created`. */
  createdAt: number;
  /** Real last-edit time (epoch ms) — sync bookkeeping only. */
  updatedAt: number;
  /** Full timestamp shown in the note header for a freshly created note. */
  when?: string;
  /** A brand-new, never-typed note (empty title line, caret-ready). */
  fresh?: boolean;
  /** Not yet committed into DATA (so the first real edit unshifts it in). */
  isNew?: boolean;
  /** Desktop-only metadata, carried through unedited — see {@link ForeignMeta}. */
  foreign?: ForeignMeta;
}
