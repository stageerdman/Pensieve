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
  // each mints a brand-new memory (title "New Image"/"New Recording"/"New Video") then jumps
  // straight into capture — distinct from the Conditional "Photo"/"Gallery"/"Video" spells,
  // which add to an OPEN one. Film hands off to the native video camera (like Snap, NOT a
  // custom in-page recorder like Record — there's no WebKit MediaRecorder-on-video problem
  // to dodge for video the way there was for voice, since iOS's own camera writes the file).
  { id: "snap", name: "Snap", icon: "camera" },
  { id: "voice", name: "Record", icon: "mic" },
  { id: "film", name: "Film", icon: "video" },
  // Mints a Raw Memory (not a Memory — see lib/raw/rawMemory) and jumps straight into
  // the continuous journal-page camera session (lib/media/journalCamera), same
  // "mint then capture" shape as Snap/Record/Film but its own engine: a real
  // getUserMedia session that stays open across the whole batch, since file-input
  // capture (what Snap/Film use) is single-shot by design and can't do that.
  { id: "journal", name: "Journal", icon: "book" },
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
  // A Raw Memory's detail sheet: batch-level actions, same ring-not-button convention
  // as every other context (wiki.md "C" — the first prototype got this wrong with a
  // flat "Delete whole batch" button, corrected here).
  if (context === "raw-detail") {
    return [
      { id: "raw-add", name: "Add pages", icon: "camera" },
      { id: "raw-delete", name: "Delete", icon: "trash", hue: "danger" },
    ];
  }
  // a memory (note): "Photo" adds a photo to the memory (merging into an adjacent block if any);
  // "Gallery" starts a fresh, separate gallery block to fill (multi-pick); "Voice" adds a
  // recording — a detailed spell: tapping opens a 2-option sub-ring, "Record" (the same
  // recorder engine as the home Record spell, aimed at THIS memory instead of a new one) or
  // "Upload" (pick an existing audio file — e.g. a Voice Memos recording saved to Files);
  // "Delete" removes the memory — tapping it opens a confirm/cancel popup, it never deletes on
  // the tap itself. Go back lives in the bottom action bar next to the spell-menu button, not
  // the ring.
  return [
    { id: "image", name: "Photo", icon: "image" },
    { id: "gallery", name: "Gallery", icon: "gallery" },
    {
      id: "record",
      name: "Voice",
      icon: "mic",
      children: [
        { id: "record-new", name: "Record", icon: "mic" },
        { id: "record-upload", name: "Upload", icon: "upload" },
      ],
    },
    {
      id: "clip",
      name: "Video",
      icon: "video",
      children: [
        { id: "clip-film", name: "Film", icon: "video" },
        { id: "clip-upload", name: "Upload", icon: "upload" },
      ],
    },
    { id: "delete", name: "Delete", icon: "trash", hue: "danger" },
  ];
}

/** Does this context recommend spells (→ the menu opens in Conditional)? */
export function hasConditional(context: PageContext): boolean {
  return conditionalSpells(context).length > 0;
}
