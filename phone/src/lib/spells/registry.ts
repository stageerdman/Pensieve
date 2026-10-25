// registry.ts — the spell roster (DATA only; behaviour is wired in PhoneApp).
//
// The General spellbook is deliberately just the three real, daily actions — the main
// screen's menu should never show anything the owner can't actually use yet. (An earlier
// prototype roster padded this out with fake placeholder spells — Stir/Pin/Label/Link/Mark/
// Export/Thread — to exercise scroll-overflow and detailed-sub-ring UI states; removed once
// real spells landed. The sub-ring descend capability itself stays in useSpellMenu/SpellRing
// for whenever a real spell needs child options again.) Order = most-used first.

import type { PageContext, Spell } from "./types";

/** The General spellbook — the real daily spells, most-used first. */
export const GENERAL_SPELLS: Spell[] = [
  { id: "write", name: "Write", icon: "write", castGold: true, longPress: "speak" },
  { id: "accio", name: "Accio", icon: "accio", hue: "violet" },
  // tap backs up immediately; hold opens the panel (account/space/conflicts/restore).
  { id: "sync", name: "Sync", icon: "sync", hue: "gold-state", opensWindow: true, longPress: "window" },
  // each mints a brand-new memory (title "New Image"/"New Recording") then jumps straight into
  // capture — distinct from the Conditional "Photo"/"Gallery" spells, which add to an OPEN one.
  { id: "snap", name: "Snap", icon: "camera" },
  { id: "voice", name: "Record", icon: "mic" },
];

const BY_ID: Record<string, Spell> = {};
function index(spells: Spell[]) {
  for (const s of spells) {
    BY_ID[s.id] = s;
    if (s.children) index(s.children);
  }
}
index(GENERAL_SPELLS);

/** Look up a spell anywhere in the roster (top level or a detailed child). */
export function spellById(id: string): Spell | undefined {
  return BY_ID[id];
}

/**
 * The page-recommended ("conditional") roster for a context. Home has none — the main
 * screen shows only the General ring (Write/Accio/Sync), no page-local suggestions; a note
 * or open collection suggests spells that act on what's open. Return [] when a page has no
 * suggestions (the menu then opens General only).
 */
export function conditionalSpells(context: PageContext): Spell[] {
  if (context === "home") return [];
  // inside an open photo collection: "Edit" toggles arrange/remove mode on the board; "Photo"
  // adds a photo to THAT gallery. No "Gallery" spell here: you can't nest a gallery in a gallery.
  if (context === "collection") {
    return [
      { id: "edit", name: "Edit", icon: "edit" },
      { id: "image", name: "Photo", icon: "image" },
    ];
  }
  // a memory (note): "Photo" adds a photo to the memory (merging into an adjacent block if any);
  // "Gallery" starts a fresh, separate gallery block to fill (multi-pick); "Delete" removes the
  // memory — tapping it opens a confirm/cancel popup, it never deletes on the tap itself. Go
  // back lives in the bottom action bar next to the spell-menu button, not the ring.
  return [
    { id: "image", name: "Photo", icon: "image" },
    { id: "gallery", name: "Gallery", icon: "gallery" },
    { id: "delete", name: "Delete", icon: "trash", hue: "danger" },
  ];
}

/** Does this context recommend spells (→ the menu opens in Conditional)? */
export function hasConditional(context: PageContext): boolean {
  return conditionalSpells(context).length > 0;
}
