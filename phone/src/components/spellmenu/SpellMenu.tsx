// SpellMenu.tsx — the radial overlay: blur + darken the page, bloom a ring of spells.
//
// Mounted only while open (close is near-instant by design). The ring remounts on each
// nav change (form ↔ form, descend into detailed) keyed by form+depth, so the bloom/
// collapse motion replays. A windowed spell (e.g. Sync) renders a window above the ring
// and blurs it behind; closing the window returns INTO the menu, not the page.

import type { SyncStatus } from "../../lib/wand/syncMachine";
import type { Spell } from "../../lib/spells/types";
import type { SpellMenuApi } from "../../hooks/useSpellMenu";
import { SpellRing } from "./SpellRing";
import { SpellWindow } from "./SpellWindow";

export interface SpellMenuProps {
  api: SpellMenuApi;
  onCast: (spell: Spell) => void;
  onLongCast: (spell: Spell) => void;
  syncState: SyncStatus;
  account: string;
  onSyncPrimary: () => void;
  reduce: boolean;
}

export function SpellMenu({ api, onCast, onLongCast, syncState, account, onSyncPrimary, reduce }: SpellMenuProps) {
  if (!api.open) return null;
  const conditional = api.form === "conditional";
  const windowed = api.windowSpellId !== null;

  return (
    <div className={`spell-overlay${windowed ? " windowed" : ""}${reduce ? " reduce" : ""}`}>
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
        enterDetailed={api.enterDetailed}
        openWindow={api.openWindow}
        back={api.back}
        toGeneral={api.toGeneral}
        toSuggested={api.toSuggested}
        setScroll={api.setScroll}
        onBackdrop={api.close}
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
