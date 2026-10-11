// dockModel.ts — pure slot placement for the bottom control bar.
//
// The dock is a 4-cell grid (cells 0..3). The gold Spell-Menu button occupies one cell
// (menuSlot); the rest hold either ONE expanded spell (spanning the 3 remaining cells) or
// 1–3 collapsed spells (one cell each). This module turns a DockLayout into concrete cell
// placements and enforces the invariants at dev time.

import type { DockLayout, DockSpell, IconName, SyncBadge } from "./types";

export type DockCell = 0 | 1 | 2 | 3;

export interface PlacedMenu {
  kind: "menu";
  cell: DockCell;
}
export interface PlacedCollapsed {
  kind: "collapsed";
  id: string;
  icon: IconName;
  label?: string;
  badge?: SyncBadge;
  cell: DockCell;
}
export interface PlacedExpanded {
  kind: "expanded";
  id: string;
  startCell: DockCell; // 0 or 1
  span: 3;
}
export type Placed = PlacedMenu | PlacedCollapsed | PlacedExpanded;

function isExpanded(spells: DockSpell[]): boolean {
  return spells.length === 1 && spells[0].kind === "expanded";
}

/**
 * Place a DockLayout into cells. Throws on an invalid layout (caught in dev; a view's
 * layout is authored, not user input). Returns the menu button plus the placed spells,
 * each carrying its 0-based cell index (the component maps cell → gridColumn = cell + 1).
 */
export function placeDock(layout: DockLayout): Placed[] {
  const { menuSlot, spells } = layout;
  if (menuSlot < 0 || menuSlot > 3) throw new Error(`dock: menuSlot ${menuSlot} out of range 0..3`);

  const hasExpanded = spells.some((s) => s.kind === "expanded");
  const hasCollapsed = spells.some((s) => s.kind === "collapsed");
  if (hasExpanded && hasCollapsed) throw new Error("dock: cannot mix an expanded spell with collapsed spells");
  if (hasExpanded && spells.length !== 1) throw new Error("dock: only one expanded spell is allowed");
  if (hasCollapsed && spells.length > 3) throw new Error(`dock: at most 3 collapsed spells (got ${spells.length})`);

  const out: Placed[] = [{ kind: "menu", cell: menuSlot as DockCell }];

  if (isExpanded(spells)) {
    // 3 contiguous free cells require the menu button in a corner
    if (menuSlot !== 0 && menuSlot !== 3) {
      throw new Error(`dock: an expanded spell needs menuSlot 0 or 3 (got ${menuSlot})`);
    }
    const startCell: DockCell = menuSlot === 0 ? 1 : 0;
    const s = spells[0] as Extract<DockSpell, { kind: "expanded" }>;
    out.push({ kind: "expanded", id: s.id, startCell, span: 3 });
    return out;
  }

  // collapsed: fill the free cells left → right
  const freeCells = ([0, 1, 2, 3] as DockCell[]).filter((c) => c !== menuSlot);
  spells.forEach((s, i) => {
    if (s.kind !== "collapsed") return;
    out.push({ kind: "collapsed", id: s.id, icon: s.icon, label: s.label, badge: s.badge, cell: freeCells[i] });
  });
  return out;
}

/** The home (Memory-bank) dock: gold button bottom-right, Accio spanning cells 0–2. */
export const HOME_DOCK: DockLayout = {
  menuSlot: 3,
  spells: [{ kind: "expanded", id: "accio" }],
  settings: true,
};
