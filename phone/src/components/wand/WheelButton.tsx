// WheelButton.tsx — one seat on the thumb-wheel (a .wact).
//
// Source icons ~1067-1071, markup built at ~1090-1091. The className is CONSTANT per
// key so React never rewrites it on re-render — useWheelGesture owns the transform /
// opacity / z-index (inline style) and the .centered/.flash/.holding classes, writing
// them directly to this node (HARD constraint #1). Only the sync seat's data-state is
// React-driven (the wheel hook doesn't touch it).

import type { WheelKey } from "../../hooks/useWheelGesture";
import type { SyncStatus } from "../../lib/wand/syncMachine";

function Icon({ k }: { k: WheelKey }) {
  switch (k) {
    case "accio":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" opacity=".5" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      );
    case "wand":
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19 15 9" strokeOpacity=".95" />
          <path d="M17.5 4.5v4M15.5 6.5h4" strokeOpacity=".9" />
          <circle cx="9" cy="15" r=".6" fill="#fff" stroke="none" opacity=".8" />
        </svg>
      );
    case "sync":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path className="lemniscate" pathLength="1" d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z" />
        </svg>
      );
    case "adjust":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" strokeDasharray="2.6 3" />
          <path d="M12 8v8M8 12h8" opacity=".55" />
        </svg>
      );
  }
}

export function WheelButton({ k, syncState }: { k: WheelKey; syncState?: SyncStatus }) {
  const className = "wact" + (k === "wand" ? " hero" : "") + (k === "adjust" ? " adjust" : "");
  return (
    <div className={className} data-key={k} data-state={k === "sync" ? syncState : undefined}>
      <Icon k={k} />
    </div>
  );
}
