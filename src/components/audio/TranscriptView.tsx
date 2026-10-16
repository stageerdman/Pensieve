import { useEffect, useMemo, useRef } from "react";
import { getController, releaseController, type AudioController } from "../../lib/audio/controller";
import { fmt } from "../../lib/audio/time";
import { syncAt, wordStart, flatWordIndex } from "../../lib/transcripts/transcript";
import type { Transcript } from "../../lib/transcripts/types";

// The transcript reading body: speaker turns with the spoken word highlighted as the
// audio plays (segment-aware sync), click-a-word-to-seek, and auto-scroll while playing.
// Presentational + portable; it drives the SHARED controller (keyed by `src`) so a split
// pane / inline reader and the inline bar move as one playhead. No dock here — the host
// (split pane or inline dropdown) provides the player above.
//
// Highlight is applied by INCREMENTAL DOM class toggles (not React re-renders) so a long
// transcript stays smooth at speech rate. Two speakers are told apart by weight/tone only.

interface Props {
  src: string;
  /** Shared-controller key (the owning block's id) so this view drives the SAME playhead as
   *  its inline bar. Defaults to `src`. */
  playerKey?: string;
  transcript: Transcript;
  className?: string;
}

export function TranscriptView({ src, playerKey, transcript, className }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastFlat = useRef<number>(-1);
  const lastSeg = useRef<number>(-1);
  const cRef = useRef<AudioController | null>(null);

  // Per-segment flat word offset + a speaker→tone index (first speaker = 0, next = 1…).
  const { flatBase, speakerTone } = useMemo(() => {
    const base: number[] = [];
    let acc = 0;
    for (const s of transcript.segments) {
      base.push(acc);
      acc += s.words.length;
    }
    const order = new Map<string, number>();
    for (const s of transcript.segments) {
      const k = s.speaker ?? "";
      if (!order.has(k)) order.set(k, order.size);
    }
    return { flatBase: base, speakerTone: order };
  }, [transcript]);

  const key = playerKey ?? src;
  useEffect(() => {
    const c = getController(key, src);
    cRef.current = c;
    const apply = () => {
      const p = syncAt(transcript, c.currentTime);
      if (!p) return;
      const flat = flatWordIndex(transcript, p.segIndex, p.wordIndex);

      if (flat !== lastFlat.current) {
        // Mark the previously-active word read; advance/rewind the read range by the delta.
        if (flat > lastFlat.current) {
          for (let i = Math.max(0, lastFlat.current); i <= flat; i++) {
            const el = wordRefs.current[i];
            if (el) { el.classList.toggle("is-active", i === flat); if (i < flat) el.classList.add("is-read"); }
          }
        } else {
          for (let i = flat; i <= lastFlat.current; i++) {
            const el = wordRefs.current[i];
            if (el) { el.classList.toggle("is-active", i === flat); el.classList.remove("is-read"); }
          }
        }
        lastFlat.current = flat;

        // Auto-scroll the active word to centre WHILE PLAYING (leave reading free when paused).
        if (c.playing) {
          wordRefs.current[flat]?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }

      if (p.segIndex !== lastSeg.current) {
        turnRefs.current[lastSeg.current]?.classList.remove("is-active");
        turnRefs.current[p.segIndex]?.classList.add("is-active");
        lastSeg.current = p.segIndex;
      }
    };
    apply();
    const offT = c.on("time", apply);
    const offS = c.on("seek", apply);
    return () => {
      offT();
      offS();
      cRef.current = null;
      releaseController(key);
    };
  }, [key, src, transcript]);

  return (
    <div className={"pensieve-transcript-body" + (className ? " " + className : "")} ref={bodyRef}>
      {transcript.segments.map((seg, si) => (
        <div
          key={seg.id}
          className="pensieve-turn"
          data-spk={speakerTone.get(seg.speaker ?? "") ?? 0}
          ref={(el) => { turnRefs.current[si] = el; }}
        >
          <div className="pensieve-turn-gutter">
            {seg.speaker && <span className="pensieve-turn-speaker">{seg.speaker}</span>}
            <span className="pensieve-turn-time">{fmt(seg.start)}</span>
          </div>
          <div className="pensieve-turn-text">
            {seg.words.length
              ? seg.words.map((w, wi) => {
                  const flat = flatBase[si] + wi;
                  return (
                    <span
                      key={wi}
                      className="pensieve-tw"
                      ref={(el) => { wordRefs.current[flat] = el; }}
                      onClick={() => cRef.current?.seek(wordStart(transcript, si, wi) + 0.001)}
                    >
                      {w.w}{" "}
                    </span>
                  );
                })
              : seg.text}
          </div>
        </div>
      ))}
    </div>
  );
}
