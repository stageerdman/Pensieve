import "./patronus.css";

// The Patronus orb — bottom-left, the one corner StatusWhisper/MediaBackupWhisper (both
// bottom-right) leave empty. A silky, blurred, breathing core with three pulse rings
// dissolving outward (see updates/2026-11-10 PATRONUS-AI - OPEN and the patronus-*.html
// design exploration this is ported from) — deliberately not a spinner or a literal
// creature, just a quiet sign of life.
export function PatronusTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Patronus"
      title="Patronus"
      className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <svg viewBox="0 0 100 100" width="40" height="40" className="patronus-orb" aria-hidden="true">
        <defs>
          <radialGradient id="patronusCore" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="30%" stopColor="hsl(var(--accent-glow))" stopOpacity="0.9" />
            <stop offset="55%" stopColor="hsl(var(--accent))" stopOpacity="0.7" />
            <stop offset="80%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="patronusBloom" cx="50%" cy="48%" r="60%">
            <stop offset="0%" stopColor="hsl(var(--accent-glow))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--accent-glow))" stopOpacity="0" />
          </radialGradient>
          <filter id="patronusBlur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
        </defs>
        <g stroke="hsl(var(--accent-glow))" strokeWidth="1" fill="none">
          <circle cx="50" cy="50" r="16" className="patronus-ring" style={{ animationDelay: "0s" }} />
          <circle cx="50" cy="50" r="16" className="patronus-ring" style={{ animationDelay: "1.2s" }} />
          <circle cx="50" cy="50" r="16" className="patronus-ring" style={{ animationDelay: "2.4s" }} />
        </g>
        <circle cx="50" cy="50" r="24" fill="url(#patronusBloom)" filter="url(#patronusBlur)" />
        <g className="patronus-breathe">
          <circle cx="50" cy="50" r="16" fill="url(#patronusCore)" filter="url(#patronusBlur)" />
        </g>
      </svg>
    </button>
  );
}
