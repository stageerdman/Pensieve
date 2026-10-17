import { useEffect, useRef, useState } from "react";
import { getController, releaseController } from "../../lib/audio/controller";
import { fmt } from "../../lib/audio/time";
import { Waveform } from "./Waveform";
import { PlayIcon, PauseIcon, TranscriptIcon } from "./icons";
import type { TranscriptState } from "./AudioBar";
import "./audio.css";

// The gallery waveform CARD — the same playback engine + waveform as the bar, re-laid as a
// compact vertical mini-player so audio can ride the justified image strip like a wide
// photo (fixed aspect, scales with the row height). Waveform on top (the scrub surface),
// controls underneath (play · time · transcript→split). No title, no ⋯ menu, no inline
// reader: per the locked spec the card's transcript opens ONLY in the split view.

interface Props {
  src: string;
  /** Shared-controller key (the gallery entry's id) so the card + its split share a playhead. */
  playerKey?: string;
  peaksSrc?: string;
  transcriptState?: TranscriptState;
  /** Open the transcript split (the card's only transcript affordance). */
  onOpenSplit?: () => void;
}

export function WaveformCard({ src, playerKey, peaksSrc, transcriptState = "absent", onOpenSplit }: Props) {
  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);
  const key = playerKey ?? src;
  const controllerRef = useRef(getController(key, src));

  useEffect(() => {
    const c = controllerRef.current;
    const offs = [c.on("play", tick), c.on("pause", tick), c.on("time", tick), c.on("durationchange", tick)];
    return () => {
      offs.forEach((off) => off());
      releaseController(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, src]);

  const c = controllerRef.current;
  const hasTranscript = transcriptState === "present";
  const transcriptLabel =
    transcriptState === "present" ? "Open transcript — split view"
    : transcriptState === "transcribing" ? "Transcribing…"
    : "No transcript yet";

  return (
    <div className={"pensieve-audio-card" + (c.playing ? " is-playing" : "")}>
      <Waveform controller={c} peaksSrc={peaksSrc ?? src} label="Seek" />
      <div className="pensieve-audio-card-controls">
        <button
          type="button"
          className="pensieve-audio-play is-sm"
          aria-label={c.playing ? "Pause" : "Play"}
          onClick={() => c.toggle()}
        >
          {c.playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        </button>
        <span className="pensieve-audio-time">
          <span className="cur">{fmt(c.currentTime)}</span>
          <span className="sep">/</span>
          <span className="tot">{fmt(c.duration)}</span>
        </span>
        <span className="pensieve-audio-card-spacer" />
        <button
          type="button"
          className={"pensieve-audio-iconbtn pensieve-audio-transcript is-" + transcriptState}
          aria-label={transcriptLabel}
          title={transcriptLabel}
          disabled={transcriptState === "transcribing"}
          onClick={() => hasTranscript && onOpenSplit?.()}
        >
          <TranscriptIcon size={15} />
        </button>
      </div>
    </div>
  );
}
