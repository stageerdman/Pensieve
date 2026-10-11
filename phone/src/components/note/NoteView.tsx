// NoteView.tsx — the full-screen read/write surface (Apple-Notes-smooth, autosave).
//
// Source markup ~520-542. Always mounted; it slides up via the .open class (React
// state) and its transform transition. The date + "Saved" indicator are set
// imperatively on their refs (openNote / useAutosave). The top chrome fades out on
// .editing-note (CSS).

import { NoteBody } from "./NoteBody";
import { NoteToolbar, type FmtKey } from "./NoteToolbar";

export function NoteView({
  open,
  noteRef,
  surfaceRef,
  bodyRef,
  dateRef,
  savedRef,
  voiceRef,
  micListening,
  onBack,
  onDateClick,
  onBodyInput,
  onBodyKeyDown,
  onBodyFocus,
  onBodyBlur,
  onFormat,
  onVoice,
  onDone,
}: {
  open: boolean;
  noteRef: React.RefObject<HTMLDivElement>;
  surfaceRef: React.RefObject<HTMLDivElement>;
  bodyRef: React.RefObject<HTMLDivElement>;
  dateRef: React.RefObject<HTMLDivElement>;
  savedRef: React.RefObject<HTMLDivElement>;
  voiceRef: React.RefObject<HTMLButtonElement>;
  micListening: boolean;
  onBack: () => void;
  onDateClick: () => void;
  onBodyInput: () => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBodyFocus: () => void;
  onBodyBlur: () => void;
  onFormat: (f: FmtKey) => void;
  onVoice: () => void;
  onDone: () => void;
}) {
  return (
    <div className={open ? "note open" : "note"} ref={noteRef}>
      <div className="note-top">
        <button className="back" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div className="note-date" ref={dateRef} onClick={onDateClick} />
        <div className="note-saved" ref={savedRef}>
          <i /> Saved
        </div>
      </div>
      <div className="note-surface" ref={surfaceRef}>
        <NoteBody bodyRef={bodyRef} onInput={onBodyInput} onKeyDown={onBodyKeyDown} onFocus={onBodyFocus} onBlur={onBodyBlur} />
      </div>
      <NoteToolbar micListening={micListening} voiceRef={voiceRef} onFormat={onFormat} onVoice={onVoice} onDone={onDone} />
    </div>
  );
}
