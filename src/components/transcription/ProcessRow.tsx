// ProcessRow — the standalone, reusable unit of ANY processing queue (audio today; images
// / video / OCR later). The shell is type-agnostic; audio's extras (a preview ▶ and a model
// badge) are opt-in via props. Standard layout, left → right:
//   [order#] · [label (+ type extras)] · [meta] · [% while running]  + a bottom progress line.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TranscriptionModel } from "../../lib/transcripts/models";
import { MODELS, modelChoices } from "../../lib/transcripts/models";

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);
const Pause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
    <rect x="7" y="5" width="3.4" height="14" rx="1" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" />
  </svg>
);
const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[9px] w-[9px] opacity-70">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const Warn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);

/** The red error icon + its reason popover. A native `title` tooltip doesn't render in the
 *  WKWebView, so this is a real DOM popover: portaled to <body> (the drawer's `overflow-y-auto`
 *  would otherwise clip it) and `fixed` with a high z-index (the drawer is z-40). Shows on
 *  hover AND on click (click pins it open — hover alone is unreliable), anchored to the icon's
 *  right edge so it opens leftward/upward and never runs off the drawer edge. */
function ErrorTip({ message }: { message?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);

  const text = message?.trim() || "Couldn't process — press Run to retry.";

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 6 });
  };
  const show = () => { place(); setOpen(true); };
  const hide = () => { if (!pinned) setOpen(false); };
  const toggle = () => { place(); const next = !pinned; setPinned(next); setOpen(next); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={() => { setPinned(false); setOpen(false); }}
        onClick={toggle}
        aria-label="Show error"
        className="inline-flex shrink-0 cursor-help text-danger"
      >
        <Warn />
      </button>
      {open && pos &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={hide}
            style={{ right: pos.right, bottom: pos.bottom }}
            className="fixed z-[70] max-h-[40vh] w-[260px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-danger/40 bg-surface-raised px-3 py-2 text-xs leading-relaxed text-text shadow-lg"
          >
            <div className="mb-1 font-semibold text-danger">Transcription failed</div>
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface ProcessRowProps {
  order: number;
  label: string;
  tooltip?: string;
  /** mono styling for raw filenames (voice memos with no title). */
  filename?: boolean;
  active?: boolean; // the row that will run next / is running
  running?: boolean; // engine is actively on this row
  pct: number; // 0..100
  error?: boolean;
  errorMsg?: string; // the failure reason — shown on hover over the error icon
  // audio-type extras (omit → a plain processing row)
  model?: TranscriptionModel;
  previewing?: boolean;
  onReorder(pos: number): void;
  onPreview?(): void;
  onSetModel?(m: TranscriptionModel): void;
}

export function ProcessRow({
  order,
  label,
  tooltip,
  filename,
  active,
  running,
  pct,
  error,
  errorMsg,
  model,
  previewing,
  onReorder,
  onPreview,
  onSetModel,
}: ProcessRowProps) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = (apply: boolean) => {
    if (!editing) return;
    const v = parseInt(inputRef.current?.value ?? "", 10);
    setEditing(false);
    if (apply && !Number.isNaN(v)) onReorder(v);
  };

  const showPct = !error && (pct > 0 || !!running);

  return (
    <div
      className={`relative flex items-center gap-2.5 rounded-lg px-2 py-2 ${active ? "bg-accent/5" : ""}`}
      data-ref-order={order}
    >
      {/* order number — click to renumber */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          defaultValue={order}
          aria-label="New position"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(true); }
            else if (e.key === "Escape") { e.preventDefault(); commit(false); }
          }}
          onBlur={() => commit(true)}
          className="h-6 w-6 shrink-0 rounded-full border border-accent bg-surface p-0 text-center font-mono text-xs text-text tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Reorder — type a new position"
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-xs tabular-nums ${
            active ? "border-accent bg-accent text-surface" : "border-border bg-surface text-text-muted hover:border-accent/60 hover:text-text"
          }`}
        >
          {order}
        </button>
      )}

      {/* label (ellipsis; hover shows full title) */}
      <span
        className={`min-w-0 flex-1 truncate ${filename ? "font-mono text-xs text-text-muted" : "text-sm text-text"}`}
        title={tooltip ?? label}
      >
        {label}
      </span>

      {/* audio preview — hear the recording */}
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          title={previewing ? "Pause preview" : "Play recording"}
          aria-label="Play recording"
          className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${
            previewing ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-accent/10 hover:text-text"
          }`}
        >
          {previewing ? <Pause /> : <Play />}
        </button>
      )}

      {/* per-row model badge (audio) — hidden while this row is actively running */}
      {model && onSetModel && !running && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title={`Model: ${MODELS[model].choiceLabel}`}
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-px text-[10px] font-semibold tracking-wide text-text-muted hover:border-accent/60 hover:text-text"
          >
            {MODELS[model].chipLabel}
            <Chevron />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div role="menu" className="absolute right-0 top-[120%] z-50 min-w-[11rem] rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                {modelChoices().map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onSetModel(m.id); }}
                    className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-sm text-text hover:bg-accent/10"
                  >
                    <span>{m.choiceLabel}</span>
                    {m.id === model && <span className="text-accent">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* running % + error */}
      {showPct && (
        <span className="w-9 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-accent">
          {Math.round(pct)}%
        </span>
      )}
      {error && <ErrorTip message={errorMsg} />}

      {/* thin running line along the bottom */}
      {showPct && (
        <div className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-border/70">
          <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
