// RestoreFromCloud.tsx — the quiet escape hatch at the foot of the Sync window.
//
// Deliberately NOT a button: a single line of muted, dotted-underlined text. Tapping it
// doesn't act — it reveals an inline confirm, because restore REPLACES everything on this
// phone with the cloud copy (local changes are lost). Auto-disarms if left untouched, so
// a stray tap never stays armed. Mirrors the desktop component of the same name.

import { useEffect, useRef, useState } from "react";

const DISARM_MS = 4000;

export function RestoreFromCloud({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const disarm = () => {
    clear();
    setArmed(false);
  };
  useEffect(() => clear, []);

  if (!armed) {
    return (
      <button
        type="button"
        className="sw-restore"
        onClick={() => {
          setArmed(true);
          clear();
          timer.current = setTimeout(() => setArmed(false), DISARM_MS);
        }}
      >
        Restore everything from cloud
      </button>
    );
  }

  return (
    <div className="sw-restore-confirm">
      <p>This replaces everything on this phone with the cloud copy. Local changes are lost.</p>
      <div className="sw-restore-actions">
        <button
          type="button"
          className="sw-restore-go"
          onClick={() => {
            disarm();
            onConfirm();
          }}
        >
          Restore from cloud
        </button>
        <button type="button" className="sw-restore-cancel" onClick={disarm}>
          Cancel
        </button>
      </div>
    </div>
  );
}
