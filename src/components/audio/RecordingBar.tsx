import { useEffect, useRef, useState } from "react";
import { createRecorder, type AudioRecorder } from "../../lib/audio/recorder";
import { paintWaveform } from "../../lib/audio/waveformPaint";
import { fmt } from "../../lib/audio/time";
import { StopIcon, PauseIcon, PlayIcon } from "./icons";
import { X } from "../../components/icons";
import { log } from "../../lib/logger";
import "./audio.css";

// Map a getUserMedia rejection to a human, actionable message. Permission-denied is the
// common case on macOS and gets a "how to enable it" hint + a Retry.
function describeMicError(e: unknown): { title: string; hint: string; denied: boolean } {
  const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      title: "Microphone access is off",
      hint: "Enable it in System Settings › Privacy & Security › Microphone, then Retry.",
      denied: true,
    };
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return { title: "No microphone found", hint: "Connect a mic, then Retry.", denied: false };
  return { title: "Microphone unavailable", hint: "Something stopped the mic. Retry?", denied: false };
}

// The live recorder — the SAME `.pensieve-audio-bar`, just in its recording state (one bar,
// everywhere). It owns a recorder engine, drives the live waveform + elapsed clock on rAF,
// and raises onStop(blob) when the square is pressed. Presentational: no storage/navigation.
// Capture is born here, in place, under the cursor (the recorder IS the inline bar).

interface Props {
  /** Fired with the captured audio when the user stops. */
  onStop: (blob: Blob) => void;
  /** Fired if the mic can't start (denied/unavailable) or the user backs out. */
  onCancel: (reason?: string) => void;
}

function cssColor(el: HTMLElement, varName: string, alpha = 1): string {
  const v = getComputedStyle(el).getPropertyValue(varName).trim();
  return v ? `hsl(${v} / ${alpha})` : `rgba(127,127,127,${alpha})`;
}

export function RecordingBar({ onStop, onCancel }: Props) {
  const recRef = useRef<AudioRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveWrapRef = useRef<HTMLDivElement>(null);
  const ampsRef = useRef<number[]>([]); // live amplitude history, resampled to width each frame
  const rafRef = useRef(0);
  const sampleAccRef = useRef(0); // throttles amplitude pushes to ~every 80ms
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<{ title: string; hint: string; denied: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to re-request the mic (Retry)
  const stoppingRef = useRef(false);

  // Start the recorder on mount AND on every Retry (attempt bump); tear down on unmount or
  // before the next attempt (covers navigate-away mid-record / a retry after denial).
  useEffect(() => {
    const rec = createRecorder();
    recRef.current = rec;
    let alive = true;
    void rec
      .start()
      .then(() => {
        if (!alive) { rec.cancel(); return; }
        setError(null);
        log.info("media", "audio.record.start", { mime: rec.mimeType() });
        loop(performance.now());
      })
      .catch((e) => {
        log.warn("media", "audio.record.denied", { error: String(e) });
        if (alive) setError(describeMicError(e));
      });

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // If we unmount without a clean stop (e.g. note switch), discard the take.
      if (!stoppingRef.current) recRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const loop = (prev: number) => {
    const rec = recRef.current;
    if (!rec) return;
    const now = performance.now();
    const dt = now - prev;
    setElapsed(rec.elapsedSec());

    // Push a fresh amplitude sample at a steady cadence so the waveform grows at a
    // consistent rate regardless of frame rate; hold the last value while paused.
    if (rec.state() === "recording") {
      sampleAccRef.current += dt;
      while (sampleAccRef.current >= 80) {
        ampsRef.current.push(rec.sampleAmplitude());
        sampleAccRef.current -= 80;
      }
    }
    render();
    rafRef.current = requestAnimationFrame(() => loop(now));
  };

  const render = () => {
    const canvas = canvasRef.current;
    const wrap = waveWrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const peaks = ampsRef.current.length ? ampsRef.current : [0];
    // All captured so far reads as "played" accent (playedFrac 1) — it's live input.
    paintWaveform(ctx, {
      width: w,
      height: h,
      peaks,
      playedFrac: 1,
      colors: {
        played: cssColor(wrap, "--accent", 1),
        head: cssColor(wrap, "--accent-glow", 1),
        unplayed: cssColor(wrap, "--text-muted", 0.35),
      },
    });
  };

  const handleStop = () => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    void rec
      .stop()
      .then((blob) => {
        log.info("media", "audio.record.stop", { bytes: blob.size, sec: Math.round(rec.elapsedSec()) });
        onStop(blob);
      })
      .catch((e) => {
        log.warn("media", "audio.record.stop.error", { error: String(e) });
        onCancel("stop failed");
      });
  };

  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state() === "recording") { rec.pause(); setPaused(true); }
    else if (rec.state() === "paused") { rec.resume(); setPaused(false); }
  };

  const handleDiscard = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true; // keep the unmount cleanup from double-cancelling
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    recRef.current?.cancel();
    log.info("media", "audio.record.discard", { sec: Math.round(elapsed) });
    onCancel("discarded");
  };

  if (error) {
    // Mic denied/unavailable — a calm bail that TELLS you how to fix it and lets you Retry
    // (re-requests the mic, so after you flip the System Settings toggle it just works).
    return (
      <div className="pensieve-audio-host">
        <div className="pensieve-audio-bar is-broken">
          <span className="pensieve-audio-broken-text">
            <strong>{error.title}.</strong> {error.hint}
          </span>
          <button type="button" className="pensieve-audio-locate" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
          <button type="button" className="pensieve-audio-locate" onClick={() => onCancel(error.title)}>Dismiss</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pensieve-audio-host">
      <div className={"pensieve-audio-bar is-recording" + (paused ? " is-paused" : "")}>
        <button
          type="button"
          className="pensieve-audio-rec-stop"
          aria-label="Stop recording"
          title="Stop recording"
          onClick={handleStop}
        >
          <StopIcon size={16} />
        </button>

        <div ref={waveWrapRef} className="pensieve-audio-wave" aria-hidden="true">
          <canvas ref={canvasRef} className="pensieve-audio-canvas" />
        </div>

        <span className="pensieve-audio-time is-elapsed">
          <span className="cur">{fmt(elapsed)}</span>
        </span>

        <button
          type="button"
          className="pensieve-audio-iconbtn"
          aria-label={paused ? "Resume recording" : "Pause recording"}
          title={paused ? "Resume recording" : "Pause recording"}
          onClick={togglePause}
        >
          {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
        </button>

        <button
          type="button"
          className="pensieve-audio-iconbtn"
          aria-label="Discard recording"
          title="Discard recording"
          onClick={handleDiscard}
        >
          <X size={16} />
        </button>
      </div>
      <div className="pensieve-audio-status">
        <span className="dot" />
        <span>{paused ? "Paused" : "Recording"} · {fmt(elapsed)}</span>
      </div>
    </div>
  );
}
