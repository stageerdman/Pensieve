import { useEffect, useRef, useState, type ReactNode } from "react";
import { getController, releaseController } from "../../lib/audio/controller";
import { fmt } from "../../lib/audio/time";
import { useMediaSurface } from "./useMediaSurface";
import {
  PlayIcon, PauseIcon, MoreIcon, TranscriptIcon, DownloadIcon, RegenerateIcon,
} from "../audio/icons";
import "./video.css";

// The video counterpart to AudioBar — same controls vocabulary (play/pause, time,
// transcript, ⋯ menu), reusing the exact same shared playback engine, just showing the
// clip's own pixels in its frame instead of a waveform. See useMediaSurface for how the
// ONE shared <video> element relocates between this bar and the transcript split's dock.

export type TranscriptState = "absent" | "transcribing" | "present";

export interface VideoBarProps {
  src: string;
  /** Shared-controller key (the owning block's id) — see controller.ts. */
  playerKey?: string;
  filename?: string;
  transcriptState?: TranscriptState;
  broken?: boolean;
  /** Borderless variant docked atop a transcript view. */
  dock?: boolean;
  onCreateTranscript?: () => void;
  onRegenerateTranscript?: () => void;
  onOpenSplit?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
  onLocate?: () => void;
  /** Extra controls drawn in the bar (rare — mirrors AudioBar). */
  leading?: ReactNode;
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  sep?: boolean;
}

export function VideoBar(props: VideoBarProps) {
  const {
    src, playerKey, filename, transcriptState = "absent", broken, dock,
    onCreateTranscript, onRegenerateTranscript, onOpenSplit, onDownload, onRemove, onLocate, leading,
  } = props;

  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const key = playerKey ?? src;
  const controllerRef = useRef(broken ? null : getController(key, src, "video"));
  const mountSurface = useMediaSurface(controllerRef.current);

  useEffect(() => {
    if (broken) return;
    const c = controllerRef.current!;
    const offs = [c.on("play", tick), c.on("pause", tick), c.on("time", tick), c.on("durationchange", tick)];
    return () => {
      offs.forEach((off) => off());
      releaseController(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, src, broken]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  if (broken) {
    return (
      <div className="pensieve-video-bar is-broken">
        <span className="pensieve-video-broken-text">
          Video missing{filename ? <span className="pensieve-video-filename"> {filename}</span> : null}
        </span>
        {onLocate && <button type="button" className="pensieve-video-locate" onClick={onLocate}>Locate…</button>}
      </div>
    );
  }

  const c = controllerRef.current!;
  const dur = c.duration;
  const frac = Number.isFinite(dur) && dur > 0 ? c.currentTime / dur : 0;
  const hasTranscript = transcriptState === "present";

  const seekFromEvent = (e: React.PointerEvent) => {
    const el = scrubRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    c.seekFrac(Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))));
  };

  const menuItems: MenuItem[] = [
    ...(onDownload ? [{ label: "Download video", icon: <DownloadIcon />, onClick: onDownload }] : []),
    transcriptState === "transcribing"
      ? { label: "Transcribing…", icon: <RegenerateIcon />, disabled: true }
      : hasTranscript
        ? { label: "Regenerate transcript", icon: <RegenerateIcon />, onClick: onRegenerateTranscript }
        : { label: "Create transcript", icon: <TranscriptIcon />, onClick: onCreateTranscript },
    ...(onRemove ? [{ label: "Remove", icon: <DownloadIcon />, onClick: onRemove, danger: true, sep: true }] : []),
  ];

  const transcriptLabel =
    transcriptState === "present" ? "Open transcript — split view"
    : transcriptState === "transcribing" ? "Transcribing…"
    : "No transcript yet";

  return (
    <div className={"pensieve-video-host" + (dock ? " is-dock" : "")}>
      <div className="pensieve-video-frame" ref={mountSurface}>
        {leading}
        <button
          type="button"
          className={"pensieve-video-playbtn" + (c.playing ? " is-playing" : "")}
          aria-label={c.playing ? "Pause" : "Play"}
          onClick={() => c.toggle()}
        >
          {c.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>
      </div>
      <div className="pensieve-video-ctrlbar">
        <span className="pensieve-video-time">
          <span className="cur">{fmt(c.currentTime)}</span>
          <span className="sep">/</span>
          <span className="tot">{fmt(dur)}</span>
        </span>
        <div
          ref={scrubRef}
          className="pensieve-video-scrub"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(frac * 100)}
          tabIndex={0}
          onPointerDown={seekFromEvent}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") c.seek(c.currentTime + 5);
            else if (e.key === "ArrowLeft") c.seek(c.currentTime - 5);
            else return;
            e.preventDefault();
          }}
        >
          <div className="pensieve-video-scrub-fill" style={{ width: `${frac * 100}%` }} />
        </div>
        {!dock && (
          <button
            type="button"
            className={"pensieve-video-iconbtn pensieve-video-transcript is-" + transcriptState}
            aria-label={transcriptLabel}
            title={transcriptLabel}
            disabled={transcriptState === "transcribing"}
            onClick={() => hasTranscript && onOpenSplit?.()}
          >
            <TranscriptIcon size={16} />
          </button>
        )}
        <div className="pensieve-video-menu-wrap" ref={menuRef}>
          <button type="button" className="pensieve-video-iconbtn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More" onClick={() => setMenuOpen((o) => !o)}>
            <MoreIcon size={16} />
          </button>
          {menuOpen && (
            <div className="pensieve-video-menu" role="menu">
              {menuItems.map((it, i) => (
                <div key={i}>
                  {it.sep && <div className="pensieve-video-menu-sep" />}
                  <button
                    type="button"
                    role="menuitem"
                    className={"pensieve-video-menu-item" + (it.danger ? " is-danger" : "")}
                    disabled={it.disabled}
                    onClick={() => { setMenuOpen(false); it.onClick?.(); }}
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
    </div>
  );
}
