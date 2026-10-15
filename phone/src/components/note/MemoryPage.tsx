// MemoryPage.tsx — THE MEMORY PAGE: the full-screen read/write surface for one memory
// (Apple-Notes-smooth, autosave).
//
// Source markup ~520-542. It is its OWN page — mounted only while open/closing (never
// parked in the home/Memory-Bank DOM) — and slides up via the .open class (React state)
// + transform transition. The date + "Saved" indicator are set imperatively on their
// refs (openNote / useAutosave). The top chrome fades out on .editing-note (CSS).
// (Internal class names + refs still use the legacy `note*` prefix — a cosmetic rename
// deferred to keep this change surgical.)
//
// Media: a hidden <input type=file accept=image/* multiple> (NO capture attr → the native
// iOS sheet: Photo Library / Take Photo / Choose File) is the ONE picker both reach-points
// drive — the NoteToolbar photo button (keyboard-up) and the "Picture" spell (keyboard-down,
// via the gold spell-menu opener in the top chrome).

import { NoteBody } from "./NoteBody";
import { NoteToolbar, type FmtKey } from "./NoteToolbar";
import { SpellGlyph } from "../spellmenu/SpellGlyph";

export function MemoryPage({
  open,
  noteRef,
  surfaceRef,
  bodyRef,
  dateRef,
  savedRef,
  voiceRef,
  fileInputRef,
  micListening,
  onBack,
  onDateClick,
  onBodyInput,
  onBodyKeyDown,
  onBodyFocus,
  onBodyBlur,
  onFormat,
  onInsertImage,
  onPickFiles,
  onOpenSpellMenu,
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
  fileInputRef: React.RefObject<HTMLInputElement>;
  micListening: boolean;
  onBack: () => void;
  onDateClick: () => void;
  onBodyInput: () => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBodyFocus: () => void;
  onBodyBlur: () => void;
  onFormat: (f: FmtKey) => void;
  onInsertImage: () => void;
  onPickFiles: (files: FileList | null) => void;
  onOpenSpellMenu: () => void;
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
        {/* the keyboard-down reach-point: summon the note's Spell Menu (Picture leads it) */}
        <button className="note-spell" onClick={onOpenSpellMenu} aria-label="Spell menu">
          <SpellGlyph icon="menu" size={22} />
        </button>
      </div>
      <div className="note-surface" ref={surfaceRef}>
        <NoteBody bodyRef={bodyRef} onInput={onBodyInput} onKeyDown={onBodyKeyDown} onFocus={onBodyFocus} onBlur={onBodyBlur} />
      </div>
      <NoteToolbar micListening={micListening} voiceRef={voiceRef} onFormat={onFormat} onInsertImage={onInsertImage} onVoice={onVoice} onDone={onDone} />
      {/* the ONE picker: native iOS sheet (no `capture` → Photo Library / Take Photo / Choose File) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />
    </div>
  );
}
