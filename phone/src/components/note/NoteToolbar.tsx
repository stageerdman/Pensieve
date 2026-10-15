// NoteToolbar.tsx — the Apple-Notes-style keyboard accessory bar (formatting + voice +
// Done), docked at bottom:var(--kb), visible only while .kb-open.editing-note (CSS).
//
// Source markup ~530-541. Format buttons use pointerdown + preventDefault so the
// caret/selection in the editor is kept (source ~1008-1012).

export type FmtKey = "title" | "body" | "bold" | "list";

export function NoteToolbar({
  micListening,
  voiceRef,
  onFormat,
  onInsertImage,
  onVoice,
  onDone,
}: {
  micListening: boolean;
  voiceRef: React.RefObject<HTMLButtonElement>;
  onFormat: (f: FmtKey) => void;
  /** Insert a photo at the live caret (an INSERT, not a format) — fired on pointerdown +
   *  preventDefault like the format keys so the contentEditable selection is preserved. */
  onInsertImage: () => void;
  onVoice: () => void;
  onDone: () => void;
}) {
  const keep = (fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    fn();
  };
  return (
    <div className="note-toolbar">
      <div className="fmt">
        <button className="tb" aria-label="Title" onPointerDown={keep(() => onFormat("title"))}>
          Title
        </button>
        <button className="tb" aria-label="Body" onPointerDown={keep(() => onFormat("body"))}>
          Body
        </button>
        <button className="tb" aria-label="Bold" onPointerDown={keep(() => onFormat("bold"))}>
          <b>B</b>
        </button>
        <button className="tb" aria-label="Bulleted list" onPointerDown={keep(() => onFormat("list"))}>
          • List
        </button>
      </div>
      <div className="tb-right">
        {/* Photo opens the native file sheet via input.click(), which iOS only honours inside a
            TRUSTED, not-defaultPrevented gesture — so this must be a plain onClick, NOT the
            onPointerDown+preventDefault the format keys use (that suppressed the picker entirely). */}
        <button className="tb pic" aria-label="Add photo" onClick={onInsertImage}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.4" />
            <circle cx="8.4" cy="9.8" r="1.5" />
            <path d="M4 16.5l4.6-4.3a1.6 1.6 0 0 1 2.2 0L16 17M14 14.2l1.8-1.7a1.6 1.6 0 0 1 2.2 0l2 1.9" />
          </svg>
        </button>
        <button
          className={micListening ? "tb mic listening" : "tb mic"}
          ref={voiceRef}
          aria-label="Dictate"
          onPointerDown={keep(onVoice)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
          </svg>
        </button>
        <button className="tb done" onPointerDown={keep(onDone)}>
          Done
        </button>
      </div>
    </div>
  );
}
