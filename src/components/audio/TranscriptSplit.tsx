import { useEffect, useRef, useState } from "react";
import { transcriptPane, type TranscriptOpenReq } from "./transcriptController";
import { AudioBar } from "./AudioBar";
import { TranscriptView } from "./TranscriptView";

// The desktop "Split to Transcript" pane — a resizable right pane (editor left, transcript
// right). Mounted ONCE in App's body flex-row; shows/hides via the transcriptPane pub/sub
// so an inline audio bar (outside React's tree) can open it. The dock bar + the inline bar
// share ONE controller (same src), so they're one playhead with two faces. Collapsing
// fully removes the pane → the editor flexes back to its centered single column.

const MIN = 360;
const clampWidth = (w: number) => Math.max(MIN, Math.min(w, Math.round(window.innerWidth * 0.7)));

export function TranscriptSplit() {
  const [req, setReq] = useState<TranscriptOpenReq | null>(transcriptPane.current);
  const [width, setWidth] = useState(480);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => transcriptPane.subscribe(setReq), []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && transcriptPane.close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  const onDividerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
  };
  const onDividerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // Dragging the divider left (smaller clientX) widens the right pane.
    setWidth(clampWidth(drag.current.startW - (e.clientX - drag.current.startX)));
  };
  const onDividerUp = () => (drag.current = null);

  return (
    <aside className="pensieve-transcript-split" style={{ width }}>
      <div
        className="pensieve-transcript-divider"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={onDividerDown}
        onPointerMove={onDividerMove}
        onPointerUp={onDividerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth((w) => clampWidth(w + 24));
          else if (e.key === "ArrowRight") setWidth((w) => clampWidth(w - 24));
          else return;
          e.preventDefault();
        }}
      />
      <div className="pensieve-transcript">
        <div className="pensieve-transcript-head">
          <span className="pensieve-transcript-title">{req.title || "Transcript"}</span>
          <button
            type="button"
            className="pensieve-audio-iconbtn"
            aria-label="Collapse split view"
            title="Collapse split view"
            onClick={() => transcriptPane.close()}
          >
            {/* panel-collapse-right glyph */}
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
              <path d="m8 9 3 3-3 3" />
            </svg>
          </button>
        </div>
        <div className="pensieve-transcript-dock">
          <AudioBar src={req.src} playerKey={req.playerKey} dock transcriptState="present" />
        </div>
        <TranscriptView src={req.src} playerKey={req.playerKey} transcript={req.transcript} />
      </div>
    </aside>
  );
}
