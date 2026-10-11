// SpellMenu.tsx — the radial overlay: blur + darken the page, bloom a ring of spells.
//
// Mounted only while open (close is near-instant by design). The ring remounts on each
// nav change (form ↔ form, descend into detailed) keyed by form+depth, so the bloom/
// collapse motion replays. A windowed spell (e.g. Sync) renders a window above the ring
// and blurs it behind; closing the window returns INTO the menu, not the page.

import { useState } from "react";
import type { SyncStatus } from "../../lib/wand/syncMachine";
import type { Spell } from "../../lib/spells/types";
import type { PoofKind, SpellMenuApi } from "../../hooks/useSpellMenu";
import { SpellRing } from "./SpellRing";
import { SpellWindow } from "./SpellWindow";

export interface SpellMenuProps {
  api: SpellMenuApi;
  onCast: (spell: Spell) => void;
  onLongCast: (spell: Spell) => void;
  /** snapshot the ring + play the Poof bridge before a change that removes the glyphs. */
  onPoof: (kind: PoofKind) => void;
  syncState: SyncStatus;
  account: string;
  onSyncPrimary: () => void;
  reduce: boolean;
}

export function SpellMenu({ api, onCast, onLongCast, onPoof, syncState, account, onSyncPrimary, reduce }: SpellMenuProps) {
  // the last transition kind — stamped on the overlay so the incoming ring blooms to match
  const [lastKind, setLastKind] = useState<PoofKind>("close");
  if (!api.open) return null;
  const conditional = api.form === "conditional";
  const windowed = api.windowSpellId !== null;

  const go = (kind: PoofKind, fn: () => void) => {
    onPoof(kind);
    setLastKind(kind);
    fn();
  };

  return (
    <div className={`spell-overlay${windowed ? " windowed" : ""}${reduce ? " reduce" : ""}`} data-kind={lastKind}>
      <SpellRing
        key={`${api.form}:${api.detailDepth}`}
        spells={api.spells}
        hue={api.hue}
        center={api.center}
        scrollPos={api.scrollPos}
        conditional={conditional}
        reduce={reduce}
        onCast={onCast}
        onLongCast={onLongCast}
        // these change the ring (switch/descend/dismiss) → play the Poof bridge first
        enterDetailed={(s) => go("descend", () => api.enterDetailed(s))}
        openWindow={api.openWindow}
        back={() => go("ascend", api.back)}
        toGeneral={() => go("toggle", api.toGeneral)}
        toSuggested={() => go("toggle", api.toSuggested)}
        setScroll={api.setScroll}
        onBackdrop={() => go("close", api.close)}
      />

      {windowed ? (
        <SpellWindow
          spellId={api.windowSpellId!}
          syncState={syncState}
          account={account}
          onClose={api.closeWindow}
          onPrimary={onSyncPrimary}
        />
      ) : null}
    </div>
  );
}
