// types.ts — the Spell Menu data model (pure, no behaviour).
//
// A "spell" is any action a user can perform on memories (the new name for notes).
// Spells are DATA here — what they DO is wired in PhoneApp via an onCast(id) dispatch,
// so this layer stays pure and unit-testable (CODING.md: pure ↔ hook ↔ component).
//
// Two surfaces consume these:
//   · the Dock (bottom 4-slot control bar)      — DockLayout / DockSpell
//   · the radial Spell Menu overlay             — Spell / SpellMenuForm

/** The glyph set (SVG lives in components/spellmenu/SpellGlyph). "menu" = the Orbit hero. */
export type IconName =
  | "menu"
  | "write"
  | "accio"
  | "sync"
  | "stir"
  | "pin"
  | "label"
  | "link"
  | "highlight"
  | "export"
  | "thread";

/** Sync's live status, mirrored from lib/wand/syncMachine so the dock/menu can badge it. */
export type SyncBadge = "synced" | "reminder" | "syncing" | "failed" | "offline";

/**
 * A spell shown in the radial menu. `children` makes it a "detailed" spell (tapping opens
 * a nested ring); `opensWindow` makes it pop a window above the ring instead of running.
 * `hue` overrides the form hue for spells that own a colour (Accio = violet, Sync = gold+state).
 */
export interface Spell {
  id: string;
  /** short label for the ring (kept ≤ ~8 chars so labels don't collide). */
  name: string;
  icon: IconName;
  /** "violet" = Accio-owned; "gold-state" = Sync (gold + live state tint); undefined = form hue. */
  hue?: "violet" | "gold-state";
  /** detailed spell: tapping swaps the ring for a nested ring of these. */
  children?: Spell[];
  /** this spell opens a window above the ring (e.g. Sync details). */
  opensWindow?: boolean;
  /** Write & Stir flash gold on cast (serendipity / a flask always fills). */
  castGold?: boolean;
  /** long-press does something distinct (e.g. Write: tap = write, hold = speak). */
  longPress?: "speak";
  disabled?: boolean;
}

/** Which form the ring is currently showing. Detailed is a depth level, not a root form. */
export type SpellMenuForm = "general" | "conditional";

/** The page context that decides the menu's entry form + its conditional roster. */
export type PageContext = "home" | "note";

// ---- Dock (bottom control bar) ----

/** A collapsed spell takes one cell; an expanded spell spans the 3 non-menu cells. */
export type DockSpell =
  | { kind: "collapsed"; id: string; icon: IconName; label?: string; badge?: SyncBadge }
  | { kind: "expanded"; id: string };

/**
 * A view declares its dock: which cell holds the gold menu button, and what fills the rest.
 * Invariants (enforced by placeDock): `spells` is EITHER one expanded spell OR 1–3 collapsed
 * (never mixed); an expanded spell needs 3 contiguous cells ⇒ menuSlot ∈ {0, 3}.
 */
export interface DockLayout {
  menuSlot: 0 | 1 | 2 | 3;
  spells: DockSpell[];
  /** whether this view may raise the thin secondary-settings row above the dock. */
  settings?: boolean;
}
