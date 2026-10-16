import { useEffect, useRef, useState, type ReactNode } from "react";
import { getController, releaseController } from "../../lib/audio/controller";
import { fmt } from "../../lib/audio/time";
import { Waveform } from "./Waveform";
import {
  PlayIcon, PauseIcon, MoreIcon, TranscriptIcon, DownloadIcon,
  VSplitIcon, HSplitIcon, RegenerateIcon, LocateIcon,
} from "./icons";
import "./audio.css";

// The one calm audio bar — the SAME element everywhere audio lives (inline note, gallery,
// search hit, transcript dock). Purely presentational: it drives the shared controller and
// raises callbacks; it owns no storage or navigation. `.is-compact` is the only variant.

export type TranscriptState = "absent" | "transcribing" | "present";

export interface AudioBarProps {
  /** Loadable url (Tauri asset / blob / external). */
  src: string;
  /** Url used to compute the waveform peaks (usually === src). */
  peaksSrc?: string;
  /** Shown in Download + the broken state; also the download filename. */
  filename?: string;
  /** Known duration (e.g. from transcript meta) shown before audio metadata loads. */
  durationHint?: number;
  transcriptState?: TranscriptState;
  transcribingPct?: number;
  broken?: boolean;
  compact?: boolean;
  /** Status line text below the bar (recording/saving) + its tone. */
  status?: { text: string; tone?: "accent" | "gold" } | null;
  onCreateTranscript?: () => void;
  onRegenerateTranscript?: () => void;
  onOpenSplit?: () => void;
  onOpenReader?: () => void;
  onDownload?: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
  onLocate?: () => void;
  /** Extra controls drawn in the bar (e.g. a recorder's Stop) — rare. */
  leading?: ReactNode;
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  sep?: boolean; // render a separator ABOVE this item
}

export function AudioBar(props: AudioBarProps) {
  const {
    src, peaksSrc, filename, durationHint, transcriptState = "absent", transcribingPct,
    broken, compact, status,
    onCreateTranscript, onRegenerateTranscript, onOpenSplit, onOpenReader,
    onDownload, onReplace, onRemove, onLocate, leading,
  } = props;

  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(broken ? null : getController(src));

  useEffect(() => {
    if (broken) return;
    const c = controllerRef.current!;
    const offs = [
      c.on("play", tick), c.on("pause", tick),
      c.on("time", tick), c.on("durationchange", tick),
    ];
    return () => {
      offs.forEach((off) => off());
      releaseController(src);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, broken]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ── Broken: a single-row danger bar with a Locate action (never a silent empty box) ──
  if (broken) {
    return (
      <div className={"pensieve-audio-bar is-broken" + (compact ? " is-compact" : "")}>
        <span className="pensieve-audio-broken-glyph"><LocateIcon /></span>
        <span className="pensieve-audio-broken-text">
          Recording missing{filename ? <span className="pensieve-audio-filename"> {filename}</span> : null}
        </span>
        {onLocate && (
          <button type="button" className="pensieve-audio-locate" onClick={onLocate}>Locate…</button>
        )}
      </div>
    );
  }

  const c = controllerRef.current!;
  const dur = Number.isFinite(c.duration) ? c.duration : durationHint ?? NaN;
  const hasTranscript = transcriptState === "present";

  const menuItems: MenuItem[] = [
    { label: "Download recording", icon: <DownloadIcon />, onClick: onDownload },
    ...(hasTranscript
      ? [
          { label: "Split to Transcript", icon: <VSplitIcon />, onClick: onOpenSplit },
          { label: "Dropdown Transcript", icon: <HSplitIcon />, onClick: onOpenReader },
        ]
      : []),
    transcriptState === "transcribing"
      ? { label: "Transcribing…", icon: <RegenerateIcon />, disabled: true }
      : hasTranscript
        ? { label: "Regenerate transcript", icon: <RegenerateIcon />, onClick: onRegenerateTranscript }
        : { label: "Create transcript", icon: <TranscriptIcon />, onClick: onCreateTranscript },
    ...(onReplace ? [{ label: "Replace…", icon: <DownloadIcon />, onClick: onReplace, sep: true }] : []),
    ...(onRemove ? [{ label: "Remove", icon: <DownloadIcon />, onClick: onRemove, danger: true }] : []),
  ];

  const transcriptLabel =
    transcriptState === "present" ? "Open transcript — split view"
    : transcriptState === "transcribing" ? "Transcribing…"
    : "No transcript yet";

  return (
    <div className="pensieve-audio-host">
      <div className={"pensieve-audio-bar" + (c.playing ? " is-playing" : "") + (compact ? " is-compact" : "")}>
        {leading}
        <button
          type="button"
          className={"pensieve-audio-play" + (compact ? " is-sm" : "")}
          aria-label={c.playing ? "Pause" : "Play"}
          onClick={() => c.toggle()}
        >
          {c.playing ? <PauseIcon size={compact ? 15 : 18} /> : <PlayIcon size={compact ? 15 : 18} />}
        </button>

        <Waveform controller={c} peaksSrc={peaksSrc ?? src} compact={compact} />

        <span className="pensieve-audio-time">
          <span className="cur">{fmt(c.currentTime)}</span>
          <span className="sep">/</span>
          <span className="tot">{fmt(dur)}</span>
        </span>

        <button
          type="button"
          className={"pensieve-audio-iconbtn pensieve-audio-transcript is-" + transcriptState}
          aria-label={transcriptLabel}
          title={transcriptLabel}
          disabled={transcriptState === "transcribing"}
          onClick={() => hasTranscript && onOpenSplit?.()}
        >
          <TranscriptIcon size={16} />
        </button>

        <div className="pensieve-audio-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="pensieve-audio-iconbtn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreIcon size={16} />
          </button>
          {menuOpen && (
            <div className="pensieve-audio-menu" role="menu">
              {menuItems.map((it, i) => (
                <div key={i}>
                  {it.sep && <div className="pensieve-audio-menu-sep" />}
                  <button
                    type="button"
                    role="menuitem"
                    className={"pensieve-audio-menu-item" + (it.danger ? " is-danger" : "")}
                    disabled={it.disabled}
                    onClick={() => {
                      setMenuOpen(false);
                      it.onClick?.();
                    }}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {status && (
        <div className={"pensieve-audio-status" + (status.tone === "gold" ? " is-gold" : "")}>
          <span className="dot" />
          <span>{status.text}</span>
          {transcriptState === "transcribing" && typeof transcribingPct === "number" && (
            <span className="pct"> {transcribingPct}%</span>
          )}
        </div>
      )}
    </div>
  );
}
