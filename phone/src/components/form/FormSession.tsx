// FormSession.tsx — the One Question walk-through (FORMS update, owner-chosen "One Question").
//
// One question per full screen; swipe up/down between them (a vertical scroll-snap deck, the
// same native-scroll approach as the reel/lightbox). Answer in place — type, tick, rate — or
// just talk: ONE recording runs across the whole session (Record in the Dock), with the live
// voice movement at the top so it's obvious the mic hears you. The last screen is the review:
// replay the recording, optionally add a photo/video (Conditional ring), then Done.
//
// Controls obey the phone standard (UX.md): everything is in the Dock + Spell Menu at the
// bottom — the top line is information only. This component is presentational; PhoneApp owns
// the vault, the recorder engine and the pickers (see lib/forms/session for the data).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormField } from "../../../../src/lib/forms";
import type { DockLayout } from "../../lib/spells/types";
import type { NoteBlock } from "../../lib/media/noteMedia";
import { answerShape, type FormSessionModel, type SessionAnswer, type SessionAnswers } from "../../lib/forms/session";
import { activeSnapshot, fmtElapsed, pauseRecording, previewTake } from "../../lib/media/voiceCapture";
import { TakePlayer } from "./TakePlayer";
import { buildAudioEl } from "../note/mediaDom";
import { Dock } from "../dock/Dock";
import { MediaImg } from "../note/MediaImg";
import { haptic } from "../../util";

export interface FormSessionProps {
  session: FormSessionModel;
  answers: SessionAnswers;
  onAnswer: (fieldId: string, a: SessionAnswer) => void;
  /** Media on the memory so far (recordings, photos, videos), for the review screen. */
  media: NoteBlock[];
  /** Is the session's recorder running (recording or paused)? */
  recording: boolean;
  onSpell: (id: "form-record" | "back" | "form-done") => void;
  onOpenMenu: () => void;
}

const BARS = 28;

export function FormSession({ session, answers, onAnswer, media, recording, onSpell, onOpenMenu }: FormSessionProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // the take is open but paused (tap / phone lock)
  const total = session.fields.length;
  const onReview = index >= total;

  // Reaching the review pauses the take and builds a playable preview of it — you hear your
  // recording before Done. The take stays open: swipe back up + Record continues the same file.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!onReview || !recording) return;
    let alive = true;
    pauseRecording();
    void previewTake().then((blob) => {
      if (!blob || !alive) return;
      const r = new FileReader();
      r.onload = () => alive && setPreview(String(r.result));
      r.readAsDataURL(blob);
    });
    return () => {
      alive = false;
    };
  }, [onReview, recording]);

  // Which screen is showing = the snapped scroll position.
  const onScroll = () => {
    const el = deckRef.current;
    if (!el || !el.clientHeight) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== index) {
      setIndex(i);
      haptic(6);
    }
  };
  const goTo = (i: number) => {
    const el = deckRef.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };

  const layout: DockLayout = onReview
    ? { menuSlot: 3, spells: [{ kind: "expanded", id: "form-done", icon: "form", label: "Done" }] }
    : {
        menuSlot: 3,
        align: "end",
        spells: [
          { kind: "collapsed", id: "back", icon: "back", label: "Back" },
          { kind: "collapsed", id: "form-record", icon: "mic", label: recording ? "Pause" : "Record" },
        ],
      };

  return (
    <div className="ph-form" role="dialog" aria-modal="true" aria-label={session.formTitle}>
      <TopLine session={session} index={index} total={total} recording={recording} onPaused={setPaused} />
      <div className="ph-form-deck" ref={deckRef} onScroll={onScroll}>
        {session.fields.map((f, i) => (
          <section className="ph-form-card" key={f.id} aria-label={`Question ${i + 1} of ${total}`}>
            <h2 className="ph-form-q">{f.question}</h2>
            {f.kind === "question" && guidance(f).length ? <p className="ph-form-guide">{guidance(f).join("\n")}</p> : null}
            <Answer field={f} value={answers[f.id] ?? {}} onChange={(a) => onAnswer(f.id, a)} />
            <button type="button" className="ph-form-peek" onClick={() => goTo(i + 1)}>
              {i + 1 < total ? (
                <>
                  <span>Next</span>
                  <b>{session.fields[i + 1].question}</b>
                </>
              ) : (
                <b>That's the last one</b>
              )}
              <span aria-hidden="true">↑</span>
            </button>
          </section>
        ))}
        <section className="ph-form-card ph-form-review" aria-label="Review">
          <h2 className="ph-form-q">All done</h2>
          <Review media={media} recording={recording} preview={recording ? preview : null} />
        </section>
      </div>
      <Dock layout={layout} onOpenMenu={onOpenMenu} onSpell={(id) => onSpell(id as "form-record" | "back" | "form-done")} recordingSpell={recording && !paused ? "form-record" : undefined} />
    </div>
  );
}

/** The guidance under a question = its prose lines that aren't an empty list starter. */
function guidance(f: FormField): string[] {
  return f.text.filter((l) => !/^\s*([-*+]|\d+[.)])\s*$/.test(l)).map((l) => l.replace(/\*\*/g, "").trim());
}

/** Info only: where you are, and — while recording — the live voice movement + time. */
function TopLine({
  session,
  index,
  total,
  recording,
  onPaused,
}: {
  session: FormSessionModel;
  index: number;
  total: number;
  recording: boolean;
  onPaused: (paused: boolean) => void;
}) {
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(0.08));
  const [time, setTime] = useState("0:00");
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!recording) return;
    let raf = 0;
    const loop = () => {
      const snap = activeSnapshot();
      if (snap) {
        setTime(fmtElapsed(snap.elapsedSec));
        const p = snap.state !== "recording";
        setPaused(p);
        onPaused(p);
        setBars((prev) => [...prev.slice(1), 0.08 + snap.sampleAmplitude * 0.92]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  const where = index < total ? `${index + 1} of ${total}` : "Review";
  return (
    <div className="ph-form-top">
      <div className="ph-form-where">
        {recording ? (
          <span className={"ph-form-rec" + (paused ? " is-paused" : "")}>
            <span className={"ph-voice-dot" + (paused ? " is-paused" : "")} aria-hidden="true" />
            {paused ? "Paused" : time}
          </span>
        ) : null}
        <span>
          {where} · {session.formTitle}
        </span>
      </div>
      {recording ? (
        <div className={"ph-form-wave" + (paused ? " is-paused" : "")} aria-hidden="true">
          {bars.map((b, i) => (
            <span key={i} className="ph-voice-bar" style={{ transform: `scaleY(${Math.max(0.08, paused ? 0.08 : b)})` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Answer({ field, value, onChange }: { field: FormField; value: SessionAnswer; onChange: (a: SessionAnswer) => void }) {
  if (field.kind === "scale" && field.scale) {
    const anchors = field.scale.anchors;
    return (
      <div className="ph-form-answer">
        <div className="ph-form-scale" role="radiogroup" aria-label="Rating">
          {anchors.map((a, i) => {
            const n = i + 1;
            const on = value.scale === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a ? `${n}: ${a}` : String(n)}
                className={on ? "on" : ""}
                onClick={() => {
                  haptic(10);
                  onChange({ ...value, scale: on ? undefined : n });
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="ph-form-anchor">{value.scale ? anchors[value.scale - 1] : "Tap a number — or just say it"}</p>
      </div>
    );
  }
  if (field.kind === "checklist" && field.items) {
    const ticked = new Set(value.checks ?? []);
    return (
      <div className="ph-form-answer">
        {field.items.map((it) => {
          const on = ticked.has(it.label);
          return (
            <button
              key={it.label}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={"ph-form-check" + (on ? " on" : "")}
              onClick={() => {
                haptic(8);
                const next = new Set(ticked);
                if (on) next.delete(it.label);
                else next.add(it.label);
                onChange({ ...value, checks: field.items!.map((x) => x.label).filter((l) => next.has(l)) });
              }}
            >
              <span className="ph-form-box" aria-hidden="true" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return <TextAnswer field={field} value={value.text ?? ""} onChange={(text) => onChange({ ...value, text })} />;
}

function TextAnswer({ field, value, onChange }: { field: FormField; value: string; onChange: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const shape = answerShape(field);
  return (
    <div className="ph-form-answer">
      <textarea
        ref={ref}
        className="ph-form-text"
        rows={2}
        value={value}
        placeholder={shape === "text" ? "Type — or just say it" : "One per line — or just say it"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The last screen: the saved recording(s) to replay, plus any photos/videos added. */
function Review({ media, recording, preview }: { media: NoteBlock[]; recording: boolean; preview: string | null }) {
  const audio = media.filter((m): m is Extract<NoteBlock, { kind: "audio" }> => m.kind === "audio");
  const images = media.flatMap((m) => (m.kind === "image" ? [m.ref] : m.kind === "gallery" ? m.images.map((x) => x.ref) : []));
  const videos = media.filter((m) => m.kind === "video").length;
  return (
    <div className="ph-form-answer">
      {preview ? (
        <>
          <p className="ph-form-guide">Your recording — play it back. Want to add more? Swipe up and tap Record.</p>
          <TakePlayer url={preview} label="Your recording" />
        </>
      ) : recording ? (
        <p className="ph-form-guide">Getting your recording ready…</p>
      ) : audio.length ? (
        audio.map((a) => <AudioPlayer key={a.ref} block={a} />)
      ) : (
        <p className="ph-form-guide">No recording — your typed answers are saved.</p>
      )}
      {images.length || videos ? (
        <div className="ph-form-extras">
          {images.map((ref) => (
            <div className="ph-form-thumb" key={ref}>
              <MediaImg mediaRef={ref} />
            </div>
          ))}
          {videos ? <span className="ph-form-guide">{videos === 1 ? "1 video" : `${videos} videos`}</span> : null}
        </div>
      ) : null}
      <p className="ph-form-guide ph-form-hint">Want to add a photo or a video? It's in the ✦ menu.</p>
      <p className="ph-form-guide">The desktop fills in your answers from the recording once it syncs.</p>
    </div>
  );
}

/** The phone's real audio bar (same element a memory renders), mounted into React. */
function AudioPlayer({ block }: { block: Extract<NoteBlock, { kind: "audio" }> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const bar = buildAudioEl(block, { onChange: () => {} });
    el.replaceChildren(bar);
    return () => el.replaceChildren();
  }, [block.ref]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="ph-form-audio" ref={host} />;
}
