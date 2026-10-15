// registry.ts — the spell roster (DATA only; behaviour is wired in PhoneApp).
//
// This is the "fake spell" roster for the explorable prototype: enough spells to exercise
// every state of the Spell Menu — scroll overflow (General = 10 → scroll ring), a static
// ring (Conditional/home = 4), detailed sub-rings (Label, Export), a window-opening spell
// (Sync), hue-owning spells (Accio = violet, Sync = gold+state), and the tap/hold spell
// (Write: tap = write, hold = speak). Order = most-used first (index 0 rests at the top).

import type { PageContext, Spell } from "./types";

/** Category variants for the Label detailed sub-ring (fake; names match the flask palette). */
const LABEL_VARIANTS: Spell[] = [
  { id: "label.blue", name: "Blue", icon: "label" },
  { id: "label.green", name: "Green", icon: "label" },
  { id: "label.purple", name: "Purple", icon: "label" },
  { id: "label.orange", name: "Orange", icon: "label" },
  { id: "label.pink", name: "Pink", icon: "label" },
  { id: "label.yellow", name: "Yellow", icon: "label" },
  { id: "label.red", name: "Red", icon: "label" },
];

/** Export formats for the Export detailed sub-ring. */
const EXPORT_VARIANTS: Spell[] = [
  { id: "export.md", name: "Markdown", icon: "export" },
  { id: "export.pdf", name: "PDF", icon: "export" },
  { id: "export.copy", name: "Copy", icon: "export" },
];

/** The General spellbook — the daily spells, most-used first. 10 → scroll ring. */
export const GENERAL_SPELLS: Spell[] = [
  { id: "write", name: "Write", icon: "write", castGold: true, longPress: "speak" },
  { id: "accio", name: "Accio", icon: "accio", hue: "violet" },
  { id: "sync", name: "Sync", icon: "sync", hue: "gold-state", opensWindow: true },
  { id: "stir", name: "Stir", icon: "stir", castGold: true },
  { id: "pin", name: "Pin", icon: "pin" },
  { id: "label", name: "Label", icon: "label", children: LABEL_VARIANTS },
  { id: "link", name: "Link", icon: "link" },
  { id: "highlight", name: "Mark", icon: "highlight" },
  { id: "export", name: "Export", icon: "export", children: EXPORT_VARIANTS },
  { id: "thread", name: "Thread", icon: "thread" },
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
 * The page-recommended ("conditional") roster for a context. Home suggests a small
 * browsing set (4 → a clean static circle); a note suggests spells that act on the open
 * memory. Return [] when a page has no suggestions (the menu then opens General only).
 */
export function conditionalSpells(context: PageContext): Spell[] {
  if (context === "home") {
    return [
      { id: "stir", name: "Stir", icon: "stir", castGold: true },
      { id: "sync", name: "Sync", icon: "sync", hue: "gold-state", opensWindow: true },
      { id: "pin", name: "Pin", icon: "pin" },
      { id: "thread", name: "Thread", icon: "thread" },
    ];
  }
  // note — a single spell for now: upload a photo into the open memory. (Go back lives in the
  // note's action bar next to the spell-menu button, not in the ring.)
  return [{ id: "image", name: "Upload photo", icon: "image" }];
}

/** Does this context recommend spells (→ the menu opens in Conditional)? */
export function hasConditional(context: PageContext): boolean {
  return conditionalSpells(context).length > 0;
}
