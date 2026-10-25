// PhoneTranscriptReader.tsx — the full-screen "Spotify-style" transcript view: a pinned mini
// player (play/pause + progress + time) with the transcript filling the rest of the screen.
// Opened from the inline audio block's transcript icon (mediaDom.ts, outside the React tree —
// see transcriptReaderController.ts for why this is a module seam, not React context).
//
// Deliberately simple (per the owner's brief): plain paragraphs, no live word/segment
// highlight, no tap-to-seek-by-line — just read while it plays. Shares the SAME playback
// controller (keyed by the audio ref) as the inline bar, so opening/closing this view never
// restarts or duplicates the audio.

import { useEffect, useRef, useState } from "react";
import { phoneTranscriptReader, type TranscriptReaderState } from "../../lib/media/transcriptReaderController";
import { fmtTime, getController } from "../../lib/media/audioController";

export function PhoneTranscriptReader() {
  const [s, setS] = useState<TranscriptReaderState>(phoneTranscriptReader.get());
  const [, setTick] = useState(0);

  useEffect(() => phoneTranscriptReader.subscribe(setS), []);

  useEffect(() => {
    if (!s.open) return;
    const c = getController(s.ref, s.src);
    const tick = () => setTick((t) => t + 1);
    const offs = [c.on("play", tick), c.on("pause", tick), c.on("time", tick), c.on("durationchange", tick)];
    return () => offs.forEach((off) => off());
  }, [s.open, s.ref, s.src]);

  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") phoneTranscriptReader.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.open]);

  const trackRef = useRef<HTMLDivElement>(null);

  if (!s.open) return null;

  const c = getController(s.ref, s.src);
  const dur = c.duration;
  const frac = Number.isFinite(dur) && dur > 0 ? c.currentTime / dur : 0;

  return (
    <div className="ph-reader" role="dialog" aria-modal="true" aria-label="Transcript">
      <div className="ph-reader-top">
        <button type="button" className="ph-reader-close" aria-label="Close" onClick={() => phoneTranscriptReader.close()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
        {s.caption ? <span className="ph-reader-title">{s.caption}</span> : null}
      </div>

      <div className="ph-reader-body">
        {(s.transcript?.segments ?? []).map((seg) => (
          <p key={seg.id} className="ph-reader-line">
            {seg.speaker ? <b className="ph-reader-speaker">{seg.speaker}: </b> : null}
            {seg.text}
          </p>
        ))}
      </div>

      <div className="ph-reader-player">
        <button
          type="button"
          className="ph-reader-play"
          aria-label={c.playing ? "Pause" : "Play"}
          onClick={() => c.toggle()}
        >
          {c.playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <rect x="6.5" y="5" width="3.6" height="14" rx="1" />
              <rect x="13.9" y="5" width="3.6" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a.75.75 0 0 0 1.14.64l10.5-6.5a.75.75 0 0 0 0-1.28L9.14 4.86A.75.75 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>
        <div
          className="ph-reader-track"
          ref={trackRef}
          onClick={(e) => {
            const r = trackRef.current!.getBoundingClientRect();
            c.seekFrac(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
          }}
        >
          <div className="ph-reader-fill" style={{ width: `${Math.min(1, Math.max(0, frac)) * 100}%` }} />
        </div>
        <span className="ph-reader-time">
          {fmtTime(c.currentTime)} / {fmtTime(dur)}
        </span>
      </div>
    </div>
  );
}
