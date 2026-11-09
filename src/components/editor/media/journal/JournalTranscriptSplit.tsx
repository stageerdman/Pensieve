import { useEffect, useRef, useState } from "react";
import { journalTranscriptPane, type JournalTranscriptOpenReq } from "./journalTranscriptController";
import { getStore } from "../../../../lib/store";
import { transcriptPlainText } from "../../../../lib/transcripts/transcript";

// The journal counterpart to ../../audio/TranscriptSplit — same real resizable-pane shell
// (.pensieve-transcript-split/-dock/-body, unchanged CSS), but the dock is a page scrubber
// (prev/next + "Page N of M") instead of a play/pause bar, since there's no audio to play.
// Mounted once at the app root beside <TranscriptSplit/> (see App.tsx); renders null until
// a Journal block opens it.

const MIN = 360;
const clampWidth = (w: number) => Math.max(MIN, Math.min(w, Math.round(window.innerWidth * 0.7)));

export function JournalTranscriptSplit() {
  const [req, setReq] = useState<JournalTranscriptOpenReq | null>(journalTranscriptPane.currentReq);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState<string>("");
  const [width, setWidth] = useState(480);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(
    () =>
      journalTranscriptPane.subscribe((next) => {
        setReq(next);
        setIndex(next?.index ?? 0);
      }),
    [],
  );

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") journalTranscriptPane.close();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(req.pages.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const page = req.pages[index];
    if (!page) return;
    let alive = true;
    setText("");
    void getStore()
      .loadTranscript(page.ref)
      .then((t) => {
        if (alive) setText(t ? transcriptPlainText(t) : "No transcript for this page.");
      });
    return () => {
      alive = false;
    };
  }, [req, index]);

  if (!req) return null;
  const page = req.pages[index];

  const onDividerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
  };
  const onDividerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
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
        }}
      />
      <div className="pensieve-transcript">
        <div className="pensieve-transcript-dock" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            aria-label="Previous page"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid hsl(var(--border))", background: "hsl(var(--surface))", cursor: "pointer" }}
          >
            ‹
          </button>
          <span style={{ fontSize: 13, color: "hsl(var(--text-muted))" }}>
            Page {index + 1} of {req.pages.length}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={index === req.pages.length - 1}
            onClick={() => setIndex((i) => Math.min(req.pages.length - 1, i + 1))}
            style={{ width: 26, height: 26, borderRadius: 999, border: "1px solid hsl(var(--border))", background: "hsl(var(--surface))", cursor: "pointer" }}
          >
            ›
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => journalTranscriptPane.close()}
            style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 999, border: "1px solid hsl(var(--border))", background: "hsl(var(--surface))", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        <div className="pensieve-transcript-body">
          {page?.url && (
            <img
              src={page.url}
              alt=""
              style={{ maxWidth: "100%", borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", marginBottom: 14 }}
            />
          )}
          <p style={{ margin: 0, lineHeight: 1.6, fontSize: "14.5px", whiteSpace: "pre-wrap" }}>{text}</p>
        </div>
      </div>
    </aside>
  );
}
