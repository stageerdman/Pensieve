// SpellMenuButton.tsx — the golden "Orbit" button that opens the Spell Menu.
//
// The one gold element in a cool dock, so it reads as THE opener. It carries the
// aggregate sync status (home has no free cell for a sync spell): while syncing, a small
// FLOWING sync rune (the desktop's animation — owner asked for it instead of a plain dot),
// then a green rune for a moment when the sync finishes; a danger dot when failed/offline;
// nothing at rest.

import type { SyncRuneState } from "../../hooks/useSyncFlash";
import { SpellGlyph } from "../spellmenu/SpellGlyph";
import { SyncRune } from "../sync/SyncRune";

export function SpellMenuButton({ onOpen, badge }: { onOpen: () => void; badge?: SyncRuneState }) {
  const alert = badge === "failed" || badge === "offline" ? "danger" : undefined;
  const rune = badge === "syncing" || badge === "flash";
  return (
    <button type="button" className="spell-fab" aria-label="Open spell menu" onClick={onOpen} data-alert={alert}>
      <SpellGlyph icon="menu" size={44} />
      {rune && <SyncRune status={badge} size={16} className="spell-fab-sync" />}
    </button>
  );
}
