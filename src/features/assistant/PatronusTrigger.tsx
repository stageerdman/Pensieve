import { useEffect, useState } from "react";
import "./patronus.css";
import { PatronusOrb } from "./PatronusOrb";

const INTRO_SEEN_KEY = "pensieve:patronus-intro-seen";

// The Patronus orb — bottom-left, the one corner StatusWhisper/MediaBackupWhisper (both
// bottom-right) leave empty. A silky, blurred, breathing core with three pulse rings
// dissolving outward (see updates/2026-11-10 PATRONUS-AI - OPEN and the patronus-*.html
// design exploration this is ported from) — deliberately not a spinner or a literal
// creature, just a quiet sign of life. An abstract glowing orb has no inherent "this is
// an AI chat" affordance (flagged in the UX review), so the very first time it appears
// a small label names it; it fades for good once seen.
export function PatronusTrigger({ onOpen }: { onOpen: () => void }) {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(INTRO_SEEN_KEY)) return;
    setShowIntro(true);
    const hide = setTimeout(() => setShowIntro(false), 4500);
    localStorage.setItem(INTRO_SEEN_KEY, "1");
    return () => clearTimeout(hide);
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Patronus"
      title="Patronus"
      className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {showIntro && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-14 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-lg animate-pulse"
        >
          Patronus — your AI, here to help
        </span>
      )}
      <PatronusOrb size={40} />
    </button>
  );
}
