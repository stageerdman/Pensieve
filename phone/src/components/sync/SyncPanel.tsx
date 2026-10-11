// SyncPanel.tsx — the sync details panel (press-hold the Sync seat, or tap when offline).
//
// Source markup ~487-500, copy ~1472-1480. Reflects the REAL device state + unsaved
// edits; the primary action adapts (Back up now / Try again / Waiting for connection).
// data-state drives the themed colours (CSS). Copy derivation is a small pure function
// so there is one source of truth for each phase's wording.

import type { SyncStatus } from "../../lib/wand/syncMachine";

interface PanelCopy {
  title: string;
  sub: string;
  primary: string;
  primaryDisabled: boolean;
}

/** Source ~1472-1480. */
export function panelCopy(status: SyncStatus): PanelCopy {
  switch (status) {
    case "synced":
      return { title: "Everything's backed up.", sub: "Your memories are safe in the cloud.", primary: "Back up now", primaryDisabled: false };
    case "reminder":
      return { title: "Changes ready to back up.", sub: "New writing lives on this device until you cast.", primary: "Back up now", primaryDisabled: false };
    case "syncing":
      return { title: "Backing up…", sub: "Weaving your memories to the cloud.", primary: "Backing up…", primaryDisabled: true };
    case "failed":
      return { title: "Backup didn't finish.", sub: "Something interrupted the cast. Your memories are safe on this device — give it another try.", primary: "Try again", primaryDisabled: false };
    case "offline":
      return { title: "You're offline.", sub: "Everything's saved here. It'll back up on its own once you're connected.", primary: "Waiting for connection", primaryDisabled: true };
  }
}

export function SyncPanel({
  status,
  open,
  account,
  onPrimary,
  onSignout,
}: {
  status: SyncStatus;
  open: boolean;
  account: string;
  onPrimary: () => void;
  onSignout: () => void;
}) {
  const copy = panelCopy(status);
  return (
    <div className={open ? "sync-panel open" : "sync-panel"} data-state={status}>
      <div className="ph">
        <span className="glyph">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path className="lemniscate" pathLength="1" d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z" />
          </svg>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="title">{copy.title}</div>
          <div className="sub">{copy.sub}</div>
        </div>
      </div>
      <button className="primary" disabled={copy.primaryDisabled} onClick={onPrimary}>
        {copy.primary}
      </button>
      <div className="foot">
        <span className="acct">{account}</span>
        <button onClick={onSignout}>Sign out</button>
      </div>
    </div>
  );
}
