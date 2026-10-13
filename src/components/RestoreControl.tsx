import { useEffect, useRef, useState } from "react";

// The destructive Restore affordance, two deliberate stages so it can't fire by accident:
//   1. "Restore"  — a quiet click arms it.
//   2. "Hold me"  — press AND hold for HOLD_MS; a red fill sweeps across as the time
//      confirmation. Release early (or never engage) and it disarms back to "Restore".
// Restoring deletes every newer version, so the hold is the safety — not a modal.

const HOLD_MS = 2000; // press-and-hold duration to commit
const ARM_REVERT_MS = 2000; // armed "Hold me" disarms if not engaged in time

export function RestoreControl({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout>>();
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();

  const clearArm = () => armTimer.current && clearTimeout(armTimer.current);
  const clearHold = () => holdTimer.current && clearTimeout(holdTimer.current);
  const startArmRevert = () => {
    clearArm();
    armTimer.current = setTimeout(() => setArmed(false), ARM_REVERT_MS);
  };

  useEffect(
    () => () => {
      clearArm();
      clearHold();
    },
    [],
  );

  const arm = () => {
    setArmed(true);
    startArmRevert();
  };

  const startHold = () => {
    clearArm(); // engaged — no longer idle
    setHolding(true);
    clearHold();
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      setArmed(false);
      onConfirm();
    }, HOLD_MS);
  };

  const cancelHold = () => {
    if (!holding) return;
    clearHold();
    setHolding(false);
    startArmRevert(); // stay armed, but disarm if left idle
  };

  if (!armed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          arm();
        }}
        className="shrink-0 rounded px-2 py-0.5 text-xs text-danger hover:bg-danger/10"
      >
        Restore
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Hold to restore this version"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        startHold();
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      style={{ touchAction: "none" }}
      className="relative shrink-0 overflow-hidden rounded border border-danger bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
    >
      {/* Full-height wash deepens the button over the hold → "getting more red". */}
      <span
        aria-hidden
        className="absolute inset-0 bg-danger"
        style={{
          opacity: holding ? 0.3 : 0,
          transition: holding ? `opacity ${HOLD_MS}ms linear` : "opacity 120ms ease-out",
        }}
      />
      {/* Solid bar fills left→right as the literal time confirmation. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[2px] bg-danger"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${HOLD_MS}ms linear` : "width 120ms ease-out",
        }}
      />
      <span className="relative">Hold me</span>
    </button>
  );
}
