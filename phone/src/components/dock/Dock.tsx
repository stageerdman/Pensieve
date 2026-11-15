// Dock.tsx — the bottom control bar: an invisible 4-cell grid (no background plate).
//
// placeDock() turns a view's DockLayout into concrete cells; this renders each: the gold
// menu button, collapsed spells (one cell), or the expanded Accio spell (spanning 3). The
// whole dock hides on .kb-open (CSS) — Accio then rides the keyboard as the summon bar.

import type { DockLayout } from "../../lib/spells/types";
import { placeDock } from "../../lib/spells/dockModel";
import { SpellGlyph } from "../spellmenu/SpellGlyph";
import { SpellMenuButton } from "./SpellMenuButton";
import { ExpandedAccio, type ExpandedAccioProps } from "./ExpandedAccio";

export interface DockProps {
  layout: DockLayout;
  onOpenMenu: () => void;
  /** props for the expanded Accio spell (only read when the layout includes it). */
  accio?: ExpandedAccioProps;
  /** tap handler for collapsed spells (non-home views). */
  onSpell?: (id: string) => void;
  /** a collapsed spell that's "live" right now (e.g. the form walk-through's Record while the
   *  take runs) — drawn hot (danger pulse) so its state reads at a glance. */
  recordingSpell?: string;
}

export function Dock({ layout, onOpenMenu, accio, onSpell, recordingSpell }: DockProps) {
  const placed = placeDock(layout);
  return (
    <div className="dock">
      {placed.map((p) => {
        if (p.kind === "menu") {
          return (
            <div className="dock-cell" style={{ gridColumn: p.cell + 1 }} key="menu">
              <SpellMenuButton onOpen={onOpenMenu} />
            </div>
          );
        }
        if (p.kind === "expanded") {
          return (
            <div className="dock-cell dock-exp" style={{ gridColumn: `${p.startCell + 1} / span 3` }} key={`exp-${p.id}`}>
              {p.id === "accio" && accio ? (
                <ExpandedAccio {...accio} />
              ) : p.id !== "accio" ? (
                <button type="button" className="dock-action" onClick={() => onSpell?.(p.id)}>
                  {p.icon ? <SpellGlyph icon={p.icon} size={22} /> : null}
                  <span>{p.label ?? p.id}</span>
                </button>
              ) : null}
            </div>
          );
        }
        return (
          <div className="dock-cell" style={{ gridColumn: p.cell + 1 }} key={`c-${p.id}`}>
            <button type="button" className={"dock-spell" + (p.id === recordingSpell ? " is-rec" : "")} aria-label={p.id} data-badge={p.badge} onClick={() => onSpell?.(p.id)}>
              <SpellGlyph icon={p.icon} size={24} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
