// SpellWindow.tsx — a window that pops ABOVE the ring for spells that need more than a cast.
//
// Sync is the worked example: tapping Sync in the menu opens this window (details + "Back
// up now"); the ring stays mounted but blurred behind it, and closing returns INTO the
// menu (not the page). Other windowed spells fall back to a simple confirmation card.

import type { SyncStatus } from "../../lib/wand/syncMachine";
import { panelCopy } from "../sync/SyncPanel";
import { RestoreFromCloud } from "../sync/RestoreFromCloud";
import { spellById } from "../../lib/spells/registry";

export interface SpellWindowProps {
  spellId: string;
  syncState: SyncStatus;
  account: string;
  /** Is OneDrive actually connected? Before this, Sync shows a Connect prompt
   *  instead of the backup panel — there's nothing to back up TO yet. */
  connected: boolean;
  onClose: () => void;
  /** run the spell's primary action (Sync: cast the backup). */
  onPrimary: () => void;
  /** Sync: restore the whole vault from the cloud (destructive — confirmed inline). */
  onRestore: () => void;
  /** Sync: start the OneDrive connect flow (navigates away). */
  onConnect: () => void;
  /** Sync: forget this device's OneDrive connection. */
  onDisconnect: () => void;
}

export function SpellWindow({ spellId, syncState, account, connected, onClose, onPrimary, onRestore, onConnect, onDisconnect }: SpellWindowProps) {
  const spell = spellById(spellId);

  if (spellId === "sync") {
    if (!connected) {
      return (
        <div className="spell-window-layer">
          <div className="spell-window" role="dialog" aria-label="Sync">
            <div className="sw-head">
              <span className="sw-rune">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path className="lemniscate" pathLength="1" d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z" />
                </svg>
              </span>
              <div className="sw-copy">
                <div className="sw-title">Connect OneDrive</div>
                <div className="sw-sub">Back up your memories, and read them on your other devices.</div>
              </div>
            </div>
            <button className="sw-primary" onClick={onConnect}>
              Connect
            </button>
            <div className="sw-foot">
              <span />
              <button className="sw-close" onClick={onClose}>
                Not now
              </button>
            </div>
          </div>
        </div>
      );
    }

    const copy = panelCopy(syncState);
    return (
      <div className="spell-window-layer">
        <div className="spell-window" data-state={syncState} role="dialog" aria-label="Sync">
          <div className="sw-head">
            <span className="sw-rune">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path className="lemniscate" pathLength="1" d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z" />
              </svg>
            </span>
            <div className="sw-copy">
              <div className="sw-title">{copy.title}</div>
              <div className="sw-sub">{copy.sub}</div>
            </div>
          </div>
          <button className="sw-primary" disabled={copy.primaryDisabled} onClick={onPrimary}>
            {copy.primary}
          </button>
          {syncState !== "syncing" && syncState !== "offline" && (
            <div className="sw-restore-row">
              <RestoreFromCloud onConfirm={onRestore} />
            </div>
          )}
          <div className="sw-foot">
            <span className="sw-acct">{account}</span>
            <span style={{ display: "flex", gap: 12 }}>
              <button className="sw-close" onClick={onDisconnect}>
                Sign out
              </button>
              <button className="sw-close" onClick={onClose}>
                Done
              </button>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // generic fallback for any other windowed spell
  return (
    <div className="spell-window-layer">
      <div className="spell-window" role="dialog" aria-label={spell?.name ?? "Spell"}>
        <div className="sw-title">{spell?.name ?? "Spell"}</div>
        <div className="sw-sub">This spell's window is a placeholder in the prototype.</div>
        <button className="sw-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
