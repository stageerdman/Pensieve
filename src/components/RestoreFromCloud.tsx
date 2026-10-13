import { useEffect, useRef, useState } from "react";

// The quiet escape hatch in the sync panel: deliberately NOT a button — just a line of
// muted, dotted-underlined text. Clicking it doesn't act; it reveals an inline confirm,
// because this REPLACES everything on this device with the cloud copy (local changes are
// lost). The confirm auto-disarms if left alone, so a stray click never stays armed.

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
        onClick={() => {
          setArmed(true);
          clear();
          timer.current = setTimeout(() => setArmed(false), DISARM_MS);
        }}
        className="text-xs text-text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-text"
      >
        Restore everything from cloud
      </button>
    );
  }

  return (
    <div className="text-xs leading-snug text-text-muted">
      <p>This replaces everything on this device with the cloud copy. Local changes are lost.</p>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            disarm();
            onConfirm();
          }}
          className="font-medium text-danger hover:underline"
        >
          Restore from cloud
        </button>
        <button type="button" onClick={disarm} className="text-text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </div>
  );
}
