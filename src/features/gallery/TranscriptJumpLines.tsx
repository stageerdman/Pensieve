import { fmt } from "../../lib/audio/time";
import type { TranscriptJump } from "../../hooks/useTranscriptHits";

// The Accio transcript-hit affordance under a result card: a short list of timecoded
// "jump-lines" — the moments the searched words were SPOKEN in the note's recording. Each
// opens the transcript split at that moment (handled by the gallery). This is what tells a
// recording hit apart from an ordinary body hit: you can leap straight to the spoken word.

const MAX_SHOWN = 5;

export function TranscriptJumpLines({
  jumps,
  onJump,
}: {
  jumps: TranscriptJump[];
  onJump: (jump: TranscriptJump) => void;
}) {
  if (jumps.length === 0) return null;
  const shown = jumps.slice(0, MAX_SHOWN);
  const extra = jumps.length - shown.length;

  return (
    <div className="mt-1 flex flex-col gap-0.5" role="list" aria-label="Spoken matches">
      {shown.map((j, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          onClick={() => onJump(j)}
          title={`Open transcript at ${fmt(j.time)}`}
          className="group flex items-center gap-2 rounded-md px-2 py-1 text-left text-2xs text-text-muted transition-colors hover:bg-accent/10"
        >
          <WaveGlyph />
          <span className="shrink-0 font-mono tabular-nums text-accent">{fmt(j.time)}</span>
          <span className="min-w-0 truncate text-text">{j.snippet}</span>
        </button>
      ))}
      {extra > 0 && (
        <span className="px-2 text-2xs text-text-muted/70">+{extra} more spoken {extra === 1 ? "match" : "matches"}</span>
      )}
    </div>
  );
}

function WaveGlyph() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="shrink-0 text-accent"
      aria-hidden="true"
    >
      <path d="M3 12h2l2-5 3 10 3-13 3 16 2-8h3" />
    </svg>
  );
}
