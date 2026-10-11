// SpellMenuButton.tsx — the golden "Orbit" button that opens the Spell Menu.
//
// The one gold element in a cool dock, so it reads as THE opener. It carries the
// aggregate sync status as an attention-only dot (home has no free cell for a sync spell):
// warn while syncing, danger when failed/offline; benign "pending" shows nothing.

import type { SyncBadge } from "../../lib/spells/types";
import { SpellGlyph } from "../spellmenu/SpellGlyph";

export function SpellMenuButton({ onOpen, badge }: { onOpen: () => void; badge?: SyncBadge }) {
  const alert =
    badge === "syncing" ? "warn" : badge === "failed" || badge === "offline" ? "danger" : undefined;
  return (
    <button type="button" className="spell-fab" aria-label="Open spell menu" onClick={onOpen} data-alert={alert}>
      <SpellGlyph icon="menu" size={28} />
    </button>
  );
}
