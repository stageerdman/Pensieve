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
  onVoice,
  onDone,
}: {
  micListening: boolean;
  voiceRef: React.RefObject<HTMLButtonElement>;
  onFormat: (f: FmtKey) => void;
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
