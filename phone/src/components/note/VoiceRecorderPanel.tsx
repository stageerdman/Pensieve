// VoiceRecorderPanel.tsx — the floating recorder UI for the "Record" spell.
//
// Presentational + a thin rAF loop: all the hard reliability work (chunked persistence,
// backgrounding, finalize) lives in lib/media/voiceCapture.ts. This panel starts the engine on
// mount, polls its snapshot each frame for the timer/waveform, and renders Pause/Resume + Done.
// There is deliberately NO discard control — backing out (Done, or the engine itself finalizing
// from a background-hide) always saves what's been captured so far, never throws it away.

import { useEffect, useRef, useState } from "react";
import { haptic } from "../../util";
import {
  activeSnapshot,
  fmtElapsed,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  type VoiceCaptureDeps,
} from "../../lib/media/voiceCapture";

export interface VoiceRecorderPanelProps {
  noteId: string;
  /** The note's untouched content right now (its "New Recording"/"added recording" placeholder)
   *  — handed to the engine so a near-instant stop with nothing captured can tell "still
   *  untouched" apart from "the user typed something while this was running". */
  placeholderBody: string;
  deps: VoiceCaptureDeps;
  /** Always fires once the take is safely saved (or, on a mic error, once dismissed). */
  onClose: () => void;
}

type Phase = "requesting" | "live" | "error";
const BAR_COUNT = 7;

export function VoiceRecorderPanel({ noteId, placeholderBody, deps, onClose }: VoiceRecorderPanelProps) {
  const [phase, setPhase] = useState<Phase>("requesting");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.08));
  const rafRef = useRef(0);
  const selfStoppedRef = useRef(false);
  const closedRef = useRef(false);

  const finish = (toastMsg?: string) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (toastMsg) deps.toast?.(toastMsg);
    onClose();
  };

  useEffect(() => {
    let alive = true;
    void startRecording(noteId, placeholderBody, deps).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setPhase("error");
        setError(r.error);
        return;
      }
      setPhase("live");
      deps.onRecordingStarted?.(noteId);
      haptic(10);
      const loop = () => {
        const snap = activeSnapshot();
        if (!snap) {
          // Ended from outside this panel — a background-hide or a mic/device failure already
          // finalized it inside voiceCapture.ts. Just reflect that here.
          finish(selfStoppedRef.current ? undefined : "Recording saved — the phone must have locked");
          return;
        }
        setElapsed(snap.elapsedSec);
        setPaused(snap.state === "paused");
        setBars((prev) => [...prev.slice(1), 0.08 + snap.sampleAmplitude * 0.92]);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePause = () => {
    haptic(8);
    if (paused) resumeRecording();
    else pauseRecording();
  };

  const handleDone = () => {
    selfStoppedRef.current = true;
    haptic(14);
    void stopRecording().then(() => finish());
  };

  return (
    <div className="ph-voice-overlay" role="dialog" aria-label="Recording voice">
      <div className="ph-voice-card">
        {phase === "error" ? (
          <>
            <p className="ph-voice-error">{error}</p>
            <button type="button" className="ph-voice-primary" onClick={() => finish()}>
              Close
            </button>
          </>
        ) : (
          <>
            <div className="ph-voice-status">
              <span className={"ph-voice-dot" + (paused ? " is-paused" : "")} aria-hidden="true" />
              <span>{phase === "requesting" ? "Starting…" : paused ? "Paused" : "Recording"}</span>
            </div>
            <div className="ph-voice-time">{fmtElapsed(elapsed)}</div>
            <div className="ph-voice-wave" aria-hidden="true">
              {bars.map((b, i) => (
                <span key={i} className="ph-voice-bar" style={{ transform: `scaleY(${Math.max(0.08, b)})` }} />
              ))}
            </div>
            <div className="ph-voice-controls">
              <button
                type="button"
                className="ph-voice-pause"
                aria-label={paused ? "Resume recording" : "Pause recording"}
                onClick={togglePause}
                disabled={phase !== "live"}
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="ph-voice-primary"
                aria-label="Stop and save"
                onClick={handleDone}
                disabled={phase !== "live"}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
