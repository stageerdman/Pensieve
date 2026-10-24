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
  /** a brief twinkle when the ring is dismissed / switched / descended. */
  onSparkle: () => void;
  syncState: SyncStatus;
  account: string;
  connected: boolean;
  onSyncPrimary: () => void;
  onSyncRestore: () => void;
  onSyncConnect: () => void;
  onSyncDisconnect: () => void;
  reduce: boolean;
}

export function SpellMenu({
  api,
  onCast,
  onLongCast,
  onSparkle,
  syncState,
  account,
  connected,
  onSyncPrimary,
  onSyncRestore,
  onSyncConnect,
  onSyncDisconnect,
  reduce,
}: SpellMenuProps) {
  if (!api.open) return null;
  const conditional = api.form === "conditional";
  const windowed = api.windowSpellId !== null;

  const go = (fn: () => void) => () => {
    onSparkle();
    fn();
  };

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
        // these change the ring (switch/descend/dismiss) → a quick twinkle
        enterDetailed={(s) => {
          onSparkle();
          api.enterDetailed(s);
        }}
        openWindow={api.openWindow}
        back={go(api.back)}
        toGeneral={go(api.toGeneral)}
        toSuggested={go(api.toSuggested)}
        setScroll={api.setScroll}
        onBackdrop={go(api.close)}
      />

      {windowed ? (
        <SpellWindow
          spellId={api.windowSpellId!}
          syncState={syncState}
          account={account}
          connected={connected}
          onClose={api.closeWindow}
          onPrimary={onSyncPrimary}
          onRestore={onSyncRestore}
          onConnect={onSyncConnect}
          onDisconnect={onSyncDisconnect}
        />
      ) : null}
    </div>
  );
}
