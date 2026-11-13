// SpellMenuButton.tsx — the golden "Orbit" button that opens the Spell Menu.
//
// The one gold element in a cool dock, so it reads as THE opener.
// DESIGN RULE (owner, non-negotiable): this button carries NOTHING extra — no status
// dot, no badge, no sync rune, no indicator of any kind next to or on it. Sync status
// lives in the Sync spell inside the menu, never on the button.

import { SpellGlyph } from "../spellmenu/SpellGlyph";

export function SpellMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="spell-fab" aria-label="Open spell menu" onClick={onOpen}>
      <SpellGlyph icon="menu" size={44} />
    </button>
  );
}
