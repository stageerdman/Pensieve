// RestoreFromCloud.tsx — the quiet, destructive escape hatch at the foot of the Sync window.
//
// Deliberately NOT a one-click action: restore REPLACES everything on this phone with the
// cloud copy (local changes are lost). A single line of muted, dotted-underlined text. The
// first tap only arms it — the SAME line turns into a red "Are you sure?" — and only a
// second tap (within 5s) actually restores. Left alone, it reverts on its own. Mirrors the
// desktop component of the same name.

import { useEffect, useRef, useState } from "react";

const REVERT_MS = 5000;

export function RestoreFromCloud({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => clear, []);

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      clear();
      timer.current = setTimeout(() => setArmed(false), REVERT_MS);
      return;
    }
    clear();
    setArmed(false);
    onConfirm();
  };

  return (
    <button type="button" className="sw-restore" data-armed={armed} onClick={onClick}>
      {armed ? "Are you sure?" : "Restore everything from cloud"}
    </button>
  );
}
