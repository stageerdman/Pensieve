import { useEffect, useRef, useState, type ReactNode } from "react";
import { getController, releaseController } from "../../lib/audio/controller";
import { fmt } from "../../lib/audio/time";
import { Waveform } from "./Waveform";
import { PlayIcon, PauseIcon, TranscriptIcon, MoreIcon, DownloadIcon, RegenerateIcon } from "./icons";
import type { TranscriptState } from "./AudioBar";
import "./audio.css";

// The gallery waveform CARD — the same playback engine + waveform as the bar, re-laid as a
// compact vertical mini-player so audio can ride the justified image strip like a wide
// photo (fixed aspect, scales with the row height). Waveform on top (the scrub surface),
// controls underneath (play · time · transcript→split · ⋯). No inline reader: per the locked
// spec the card's transcript opens ONLY in the split view; the ⋯ menu carries create/
// regenerate transcript + download (there's no other place to reach them from a card).

interface Props {
  src: string;
  /** Shared-controller key (the gallery entry's id) so the card + its split share a playhead. */
  playerKey?: string;
  peaksSrc?: string;
  transcriptState?: TranscriptState;
  /** Open the transcript split (the card's only transcript VIEW affordance). */
  onOpenSplit?: () => void;
  onCreateTranscript?: () => void;
  onRegenerateTranscript?: () => void;
  onDownload?: () => void;
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function WaveformCard({
  src, playerKey, peaksSrc, transcriptState = "absent",
  onOpenSplit, onCreateTranscript, onRegenerateTranscript, onDownload,
}: Props) {
  const [, setTick] = useState(0);
  const tick = () => setTick((t) => t + 1);
  const [menuOpen, setMenuOpen] = useState(false);
  // The card lives in an overflow:hidden gallery tile, so a normal absolute dropdown gets
  // clipped. We open the menu as a FIXED popover anchored above the ⋯ button (computed from
  // its rect) so it escapes the tile/strip clipping.
  const [menuPos, setMenuPos] = useState<{ bottom: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !moreBtnRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return; }
    const r = moreBtnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right });
    setMenuOpen(true);
  };

  const c = controllerRef.current;
  const hasTranscript = transcriptState === "present";
  const transcriptLabel =
    transcriptState === "present" ? "Open transcript — split view"
    : transcriptState === "transcribing" ? "Transcribing…"
    : "No transcript yet";

  const menuItems: MenuItem[] = [
    ...(onDownload ? [{ label: "Download recording", icon: <DownloadIcon />, onClick: onDownload }] : []),
    transcriptState === "transcribing"
      ? { label: "Transcribing…", icon: <RegenerateIcon />, disabled: true }
      : hasTranscript
        ? { label: "Regenerate transcript", icon: <RegenerateIcon />, onClick: onRegenerateTranscript }
        : { label: "Create transcript", icon: <TranscriptIcon />, onClick: onCreateTranscript },
  ];

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
        <div className="pensieve-audio-menu-wrap">
          <button
            ref={moreBtnRef}
            type="button"
            className="pensieve-audio-iconbtn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More"
            onClick={toggleMenu}
          >
            <MoreIcon size={15} />
          </button>
          {menuOpen && menuPos && (
            <div
              ref={menuRef}
              className="pensieve-audio-menu"
              role="menu"
              style={{ position: "fixed", top: "auto", left: "auto", bottom: menuPos.bottom, right: menuPos.right }}
            >
              {menuItems.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className="pensieve-audio-menu-item"
                  disabled={it.disabled}
                  onClick={() => { setMenuOpen(false); it.onClick?.(); }}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
