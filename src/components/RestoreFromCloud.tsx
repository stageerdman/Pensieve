import { useEffect, useRef, useState } from "react";

// The quiet, destructive escape hatch in the sync panel: deliberately NOT a one-click
// action, because it REPLACES everything on this device with the cloud copy (local
// changes are lost). One line of muted, dotted-underlined text. The first click only
// arms it — the SAME line turns into a red "Are you sure?" — and only a second click
// (within 5s) actually restores. Left alone, it reverts on its own.

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
    <button
      type="button"
      onClick={onClick}
      className={
        "text-xs underline decoration-dotted underline-offset-2 transition-colors " +
        (armed ? "font-medium text-danger" : "text-text-muted hover:text-text")
      }
    >
      {armed ? "Are you sure?" : "Restore everything from cloud"}
    </button>
  );
}
