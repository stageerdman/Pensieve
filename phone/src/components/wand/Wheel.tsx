// Wheel.tsx — the persistent thumb-wheel layer (corner glow + the four seats + the
// centred label).
//
// Source markup ~468-470. This renders the static DOM; useWheelGesture positions the
// buttons + label and runs the gestures imperatively via the passed refs. The layer
// floats above every surface and hides only on .kb-open / .searching (CSS). Four
// seats: Adjust · Accio · New (hero) · Sync (source ORDER ~1075).

import { ORDER } from "../../hooks/useWheelGesture";
import type { SyncStatus } from "../../lib/wand/syncMachine";
import { WheelButton } from "./WheelButton";

export function Wheel({
  wheelRef,
  labelRef,
  syncState,
}: {
  wheelRef: React.RefObject<HTMLDivElement>;
  labelRef: React.RefObject<HTMLDivElement>;
  syncState: SyncStatus;
}) {
  return (
    <>
      <div className="corner-glow" />
      <div className="wheel" ref={wheelRef}>
        {ORDER.map((k) => (
          <WheelButton key={k} k={k} syncState={k === "sync" ? syncState : undefined} />
        ))}
      </div>
      <div className="wheel-label" ref={labelRef} />
    </>
  );
}
